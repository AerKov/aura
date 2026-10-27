import { mkdirSync } from "node:fs";
import { type Chat, type Message, parseMentions, type RunCard, type Usage } from "@aura/shared";
import { commitAll, git } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import type { AgentEvent, AgentTool, McpServerSpec } from "../../providers/types";
import type { ChatRepo } from "../chat/repo";
import type { ChatService } from "../chat/service";
import type { EngineSelector } from "../engines/registry";
import type { ProjectInfo } from "../projects/service";
import type { EventHub } from "../realtime/hub";
import { buildPrompt, CONTEXT_WINDOW, userNote } from "./context";
import { teamRules, wakeNote } from "./defaults";
import type { AgentDirectory } from "./directory";
import {
  budgetLevel,
  chainDepthAllowed,
  crossedWarning,
  DEFAULT_MAX_CHAIN_DEPTH,
  runBudget,
} from "./guards";
import { type AgentProfile, ORCHESTRATOR_HANDLE } from "./profiles";
import type { RunRepo } from "./runs";
import { agentsToTrigger, type WakeReason } from "./triggers";

export interface ProjectLookup {
  get(slug: string): Promise<ProjectInfo | null>;
}

export interface RuntimeDeps {
  chat: ChatService;
  repo: ChatRepo;
  runs: RunRepo;
  hub: EventHub;
  /** Picks the engine (LLM provider) and model for each agent (ADR 0011). */
  engines: EngineSelector;
  agents: AgentDirectory;
  projects: ProjectLookup;
  /** App tools for a run (the orchestrator gets project and agent management). */
  appTools: (ctx: { handle: string; chat: Chat; depth: number }) => AgentTool[];
  /** External MCP servers an agent may use (tier 2 customization). */
  mcpServers?: (handle: string) => Record<string, McpServerSpec>;
  /** Extra system prompt sections for an agent (its skills). */
  promptExtras?: (profile: AgentProfile) => string;
  /** Notes the agent saved earlier that match this message (agent memory, ADR 0013). */
  memoryPrompt?: (input: {
    handle: string;
    projectId: string | null;
    query: string;
  }) => Promise<string>;
  ownerName: string;
  /** Working directory for runs outside a project. */
  scratchDir: string;
  maxChainDepth?: number;
  maxTurns?: number;
}

interface ActiveRun {
  runId: string;
  abort: AbortController;
}

interface Pending {
  handle: string;
  chat: Chat;
  trigger: Message;
  team: string[];
  reason: WakeReason;
}

type ToolCall = { id: string; name: string; summary: string; isError: boolean };

const CARD_FLUSH_MS = 300;

/**
 * Runs agents in response to chat messages: guards, context, streaming into the chat, persisting
 * the final reply once, committing workspace changes and recording usage (docs/SPEC.md section 7).
 */
export class AgentRuntime {
  /**
   * Runs are scheduled in lanes: one run per agent per chat (SPEC section 8, rule 4), and one run
   * at a time per project, because agents share the project's workspace and its commits.
   */
  private readonly active = new Map<string, ActiveRun>();
  /** Pending triggers per lane; the latest trigger per agent and chat wins. */
  private readonly queues = new Map<string, Pending[]>();
  private readonly idleWaiters = new Set<() => void>();
  /** Chain-limit notices already posted, so a fan-out does not post one per agent. */
  private readonly limitNotices = new Set<string>();
  /** Language of the user's latest message, so agents address the user in it. */
  private userLanguage: string | null = null;

  constructor(private readonly deps: RuntimeDeps) {}

  /** Restores the user's language from their latest message (it is kept in memory). */
  primeLanguage(text: string): void {
    this.userLanguage = detectLanguage(text) ?? this.userLanguage;
  }

  start(): () => void {
    return this.deps.chat.onMessage((message, chat) => this.onMessage(message, chat));
  }

  isBusy(): boolean {
    return this.active.size > 0;
  }

  /** Resolves when no run is active (for tests and shutdown). */
  whenIdle(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  stop(runId: string): boolean {
    for (const run of this.active.values()) {
      if (run.runId === runId) {
        run.abort.abort();
        return true;
      }
    }
    return false;
  }

  stopAll(): void {
    this.queues.clear();
    for (const run of this.active.values()) run.abort.abort();
  }

  private async onMessage(message: Message, chat: Chat): Promise<void> {
    if (message.author.kind === "user")
      this.userLanguage = detectLanguage(message.body) ?? this.userLanguage;
    const members = await this.deps.repo.members(chat.id);
    const agentMembers = members
      .filter((m) => m.participant.kind === "agent")
      .map((m) => m.participant.id);
    const replied = message.replyTo
      ? await this.deps.repo.getMessage(message.replyTo).catch(() => null)
      : null;
    const wakes = agentsToTrigger({
      message,
      chat,
      agentMembers,
      orchestrator: ORCHESTRATOR_HANDLE,
      replyTarget: replied?.author ?? null,
    });
    for (const { handle, reason } of wakes) {
      this.trigger(handle, chat, message, agentMembers, reason);
    }
  }

  private trigger(
    handle: string,
    chat: Chat,
    trigger: Message,
    team: string[],
    reason: WakeReason = "mention",
  ): void {
    const lane = chat.projectId ? `project:${chat.projectId}` : `${handle}@${chat.id}`;
    if (this.active.has(lane)) {
      const queue = (this.queues.get(lane) ?? []).filter(
        (p) => !(p.handle === handle && p.chat.id === chat.id),
      );
      queue.push({ handle, chat, trigger, team, reason });
      this.queues.set(lane, queue);
      return;
    }
    const run: ActiveRun = { runId: "", abort: new AbortController() };
    this.active.set(lane, run);
    void this.execute(handle, chat, trigger, team, run, reason)
      .catch((error: unknown) => {
        log.error("agent run crashed", {
          agent: handle,
          chat: chat.id,
          error: errorMessage(error),
        });
      })
      .finally(() => {
        this.active.delete(lane);
        const next = this.queues.get(lane)?.shift();
        if (next) {
          this.trigger(next.handle, next.chat, next.trigger, next.team, next.reason);
        } else if (this.active.size === 0) {
          for (const resolve of this.idleWaiters) resolve();
          this.idleWaiters.clear();
        }
      });
  }

  private async postSystem(chatId: string, body: string): Promise<void> {
    await this.deps.repo.createMessage({
      chatId,
      author: { kind: "bot", id: "system" },
      kind: "system",
      body,
    });
  }

  private async execute(
    handle: string,
    chat: Chat,
    trigger: Message,
    team: string[],
    run: ActiveRun,
    reason: WakeReason = "mention",
  ): Promise<void> {
    const abort = run.abort;
    const { repo, runs, hub } = this.deps;
    const profile = await this.deps.agents.get(handle);
    if (!profile) {
      await this.postSystem(
        chat.id,
        `@${handle} has no valid profile (agents/${handle}/agent.md).`,
      );
      return;
    }

    // Guard: chain depth (CLAUDE.md rule 8).
    const depth = trigger.chainDepth + 1;
    const maxDepth = this.deps.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
    if (!chainDepthAllowed(depth, maxDepth)) {
      const notice = `${chat.id}:${trigger.id}`;
      if (this.limitNotices.has(notice)) return;
      this.limitNotices.add(notice);
      await this.postSystem(
        chat.id,
        `⛔ @${handle} was not started: agents replied to each other ${maxDepth} times in a row. Reply to continue.`,
      );
      return;
    }

    // Guard: budgets per agent and per project.
    const project = chat.projectId ? await this.deps.projects.get(chat.projectId) : null;
    const agentSpent = (await runs.spentByAgent(handle)).usd;
    if (budgetLevel(agentSpent, profile.budgetUsd) === "stop") {
      await this.postSystem(
        chat.id,
        `💸 @${handle} is out of budget ($${profile.budgetUsd?.toFixed(2)}).`,
      );
      return;
    }
    if (project && budgetLevel(project.spentUsd, project.budgetUsd) === "stop") {
      await this.postSystem(
        chat.id,
        `💸 The project budget ($${project.budgetUsd?.toFixed(2)}) is used up. @${handle} was not started.`,
      );
      return;
    }
    const maxBudgetUsd = runBudget([
      { spentUsd: agentSpent, budgetUsd: profile.budgetUsd },
      ...(project ? [{ spentUsd: project.spentUsd, budgetUsd: project.budgetUsd }] : []),
    ]);

    const { provider, model } = this.deps.engines.pick(profile);
    const runId = await runs.start({
      agent: handle,
      chatId: chat.id,
      projectId: chat.projectId,
      triggerMessageId: trigger.id,
      provider: provider.id,
      model,
    });
    run.runId = runId;

    const reply = await repo.createMessage({
      chatId: chat.id,
      author: { kind: "agent", id: handle },
      body: "",
      status: "streaming",
      replyTo: chat.kind === "direct" ? null : trigger.id,
      chainDepth: depth,
      runId,
    });
    await runs.attachReply(runId, reply.id);

    const cwd = project?.workspace ?? this.deps.scratchDir;
    mkdirSync(cwd, { recursive: true });
    const headBefore = project ? await headOf(project.workspace) : null;
    const history = await repo.listMessages(chat.id, { limit: CONTEXT_WINDOW + 5 });
    const prompt =
      buildPrompt({
        agentHandle: handle,
        chatTitle: chat.title,
        history,
        trigger,
        ownerName: this.deps.ownerName,
      }) + wakeNote(reason, handle, team, this.deps.ownerName);

    const memoryNotes =
      (await this.deps.memoryPrompt?.({
        handle,
        projectId: chat.projectId,
        query: trigger.body,
      })) ?? "";

    let text = "";
    let usage: Usage | null = null;
    let error: Extract<AgentEvent, { type: "error" }> | null = null;
    const toolCalls: ToolCall[] = [];
    const card = (status: RunCard["status"], commit: string | null = null): RunCard => ({
      type: "run",
      agent: handle,
      status,
      tools: toolCalls.map(({ name, summary, isError }) => ({ name, summary, isError })),
      usage,
      error: error?.message ?? null,
      commit,
    });

    // Tool activity is shown live on the reply's run card, flushed at most every CARD_FLUSH_MS.
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleCardFlush = () => {
      flushTimer ??= setTimeout(() => {
        flushTimer = null;
        void repo.updateMessage(reply.id, { card: card("running") }).catch((e: unknown) => {
          log.warn("run card update failed", { error: errorMessage(e) });
        });
      }, CARD_FLUSH_MS);
    };

    for await (const event of provider.run(
      {
        runId,
        systemPrompt:
          systemPromptFor(profile, project !== null, team) +
          (this.deps.promptExtras?.(profile) ?? "") +
          memoryNotes +
          userNote(this.deps.ownerName, this.userLanguage),
        prompt,
        model: model ?? undefined,
        cwd,
        confineToCwd: true,
        builtinTools: toolsFor(profile, project !== null),
        tools: this.deps.appTools({ handle, chat, depth }),
        mcpServers: this.deps.mcpServers?.(handle),
        maxTurns: this.deps.maxTurns ?? 50,
        maxBudgetUsd,
      },
      abort.signal,
    )) {
      switch (event.type) {
        case "text-delta":
          text += event.text;
          hub.publish({
            type: "message.delta",
            chatId: chat.id,
            messageId: reply.id,
            text: event.text,
          });
          break;
        case "tool-call":
          toolCalls.push({
            id: event.id,
            name: event.name,
            summary: summarize(event.input),
            isError: false,
          });
          scheduleCardFlush();
          break;
        case "tool-result": {
          const call = toolCalls.find((c) => c.id === event.id);
          if (call) call.isError = event.isError ?? false;
          scheduleCardFlush();
          break;
        }
        case "usage":
          usage = {
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            costUsd: event.costUsd ?? null,
          };
          break;
        case "error":
          error = event;
          break;
        case "done":
          break;
      }
    }
    if (flushTimer) clearTimeout(flushTimer);

    const rawBody = text.trim();
    const silent = isNoReply(rawBody) && !error;
    const body = silent ? "" : rawBody;
    let commit: string | null = null;
    if (project) {
      try {
        // Only agents that can change files commit; the agent may also have committed itself.
        if (canWrite(toolsFor(profile, true))) {
          commit = await commitAll(project.workspace, `${handle}: ${commitSubject(body)}`, handle);
        }
        const headAfter = await headOf(project.workspace);
        commit ??= headAfter && headAfter !== headBefore ? headAfter : null;
      } catch (e) {
        log.error("workspace commit failed", { project: project.id, error: errorMessage(e) });
      }
    }

    const stopped = error?.code === "aborted";
    const status = stopped ? "stopped" : error ? "error" : "done";
    if (silent && toolCalls.length === 0 && !commit) {
      // The agent decided nothing was needed from it: remove the placeholder, keep the run record.
      await repo.deleteMessage(reply.id);
    }
    const final =
      silent && toolCalls.length === 0 && !commit
        ? null
        : await repo.updateMessage(reply.id, {
            body,
            mentions: parseMentions(body),
            status: body && (!error || stopped) ? "final" : "error",
            usage,
            error: error ? error.message : null,
            card: toolCalls.length > 0 || commit ? card(status, commit) : null,
          });
    await runs.finish(runId, {
      status,
      tokensIn: usage?.inputTokens ?? 0,
      tokensOut: usage?.outputTokens ?? 0,
      costUsd: usage?.costUsd ?? 0,
      toolCalls: toolCalls.map(({ name, summary, isError }) => ({ name, summary, isError })),
      error: error?.message ?? null,
    });

    const cost = usage?.costUsd ?? 0;
    if (project && crossedWarning(project.spentUsd, project.spentUsd + cost, project.budgetUsd)) {
      await this.postSystem(
        chat.id,
        `⚠️ 80% of the project budget is used ($${(project.spentUsd + cost).toFixed(2)} of $${project.budgetUsd?.toFixed(2)}).`,
      );
    }
    if (crossedWarning(agentSpent, agentSpent + cost, profile.budgetUsd)) {
      await this.postSystem(chat.id, `⚠️ @${handle} used 80% of its budget.`);
    }

    // Mentions in a completed reply may wake other agents, one level deeper in the chain.
    if (final?.status === "final" && !stopped && body) this.deps.chat.notify(final, chat);
  }
}

function systemPromptFor(profile: AgentProfile, inProject: boolean, team: string[]): string {
  if (profile.handle === ORCHESTRATOR_HANDLE || !inProject) return profile.systemPrompt;
  return `${profile.systemPrompt}\n${teamRules(profile.handle, team)}`;
}

/** The orchestrator may read a project's workspace to review it, but never edits it. */
function toolsFor(profile: AgentProfile, inProject: boolean): string[] {
  if (profile.handle === ORCHESTRATOR_HANDLE && inProject) return ["Read", "Glob", "Grep"];
  return profile.builtinTools;
}

export const NO_REPLY = "[no reply]";

function isNoReply(body: string): boolean {
  return body === "" ? false : body.toLowerCase().replace(/[.!\s]+$/, "") === NO_REPLY;
}

function canWrite(tools: string[]): boolean {
  return tools.some((t) => t === "Write" || t === "Edit" || t === "Bash");
}

async function headOf(dir: string): Promise<string | null> {
  try {
    return await git(dir, ["rev-parse", "--short", "HEAD"]);
  } catch {
    return null;
  }
}

/** Best-effort language of a user message, for addressing the user consistently. */
export function detectLanguage(text: string): string | null {
  if (/[іїєґ]/i.test(text)) return "Ukrainian";
  if (/[ыэъё]/i.test(text)) return "Russian";
  if (/[а-я]/i.test(text)) return null;
  // Latin letters only (plus punctuation, symbols, digits and spaces).
  if (/[a-z]{3,}/i.test(text) && !/[^\p{Script=Latin}\p{P}\p{S}\p{N}\s]/u.test(text))
    return "English";
  return null;
}

function commitSubject(body: string): string {
  const line =
    body
      .split("\n")
      .find((l) => l.trim())
      ?.replace(/[#*`>_]/g, "")
      .trim() ?? "";
  return (line || "update").slice(0, 72);
}

function summarize(input: unknown): string {
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    for (const key of ["command", "file_path", "path", "pattern", "handle", "name"]) {
      if (typeof record[key] === "string") return truncate(String(record[key]));
    }
  }
  try {
    return truncate(JSON.stringify(input));
  } catch {
    return "";
  }
}

function truncate(text: string): string {
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

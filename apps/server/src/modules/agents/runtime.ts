import { mkdirSync } from "node:fs";
import {
  budgetText,
  type Chat,
  formatTokens,
  type Message,
  parseMentions,
  type RunCard,
  type Usage,
} from "@aura/shared";
import { commitAll, git } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import type { AgentEvent, AgentTool, McpServerSpec, SandboxPolicy } from "../../providers/types";
import type { ChatRepo } from "../chat/repo";
import type { ChatService } from "../chat/service";
import type { EngineSelector } from "../engines/registry";
import type { ProjectInfo } from "../projects/service";
import type { EventHub } from "../realtime/hub";
import { sandboxNote, webNote } from "../sandbox/service";
import { buildPrompt, CONTEXT_WINDOW, SUMMARY_BATCH, userNote } from "./context";
import { teamRules, wakeNote } from "./defaults";
import type { AgentDirectory } from "./directory";
import {
  chainDepthAllowed,
  crossedSpendWarning,
  DEFAULT_MAX_CHAIN_DEPTH,
  runBudget,
  type Spend,
  spendLevel,
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
  appTools: (ctx: {
    handle: string;
    chat: Chat;
    depth: number;
    /** The topic the run answers in; its cards and posts go there too. */
    topicId: string | null;
  }) => AgentTool[];
  /** External MCP servers an agent may use (tier 2 customization). */
  mcpServers?: (handle: string) => Record<string, McpServerSpec>;
  /** Where a project's MCP servers run: moved into its container when it has one (ADR 0019). */
  projectMcp?: (
    project: ProjectInfo,
    servers: Record<string, McpServerSpec>,
  ) => Promise<Record<string, McpServerSpec>>;
  /** Extra system prompt sections for an agent (its skills). */
  promptExtras?: (profile: AgentProfile) => string;
  /** OS sandbox for shell commands, or null to run them without it (ADR 0015). */
  /** The OS sandbox for this agent's commands, with its network rules (ADR 0015, 0022). */
  sandboxPolicy?: (profile: AgentProfile) => SandboxPolicy | null;
  /** Hosts WebFetch may reach for this agent, or undefined for any public page (ADR 0022). */
  webHosts?: (profile: AgentProfile) => string[] | undefined;
  /** Notes the agent saved earlier that match this message (agent memory, ADR 0013). */
  memoryPrompt?: (input: {
    handle: string;
    projectId: string | null;
    query: string;
  }) => Promise<string>;
  /** The chat's rolling summary of older messages, if any (ADR 0017). */
  chatSummary?: (
    chatId: string,
    topicId: string | null,
  ) => Promise<{ text: string; upTo: string } | null>;
  /**
   * The project's container shell (ADR 0018), or null when its commands run on the host. Agents
   * with Bash get this tool instead of the host shell.
   */
  projectShell?: (
    project: ProjectInfo,
    handle: string,
    signal: AbortSignal,
    env: Record<string, string>,
  ) => { tool: AgentTool; note: string } | null;
  /** The agent's own variables for its commands, resolved, and the ones with no value (ADR 0020). */
  agentEnv?: (profile: AgentProfile) => { values: Record<string, string>; missing: string[] };
  /** Hides secret values in text shown in chat. */
  redact?: (text: string) => string;
  /** Called after each run, e.g. to fold old messages into the summary. */
  afterRun?: (chat: Chat, topicId: string | null) => void;
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
  /** Messages still being dispatched (who to wake is being decided); they count as work. */
  private dispatching = 0;
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
    return this.active.size > 0 || this.dispatching > 0;
  }

  private settleIfIdle(): void {
    if (this.isBusy()) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
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
    this.dispatching++;
    try {
      await this.dispatch(message, chat);
    } finally {
      this.dispatching--;
      this.settleIfIdle();
    }
  }

  private async dispatch(message: Message, chat: Chat): Promise<void> {
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
    if (message.author.kind === "user" && message.kind === "text" && message.status === "final") {
      await this.explainAbsent(message, chat, agentMembers);
    }
  }

  /**
   * A user's @mention of an agent outside this chat wakes nobody (agents answer only where they are
   * members), so the chat says so instead of staying silent.
   */
  private async explainAbsent(message: Message, chat: Chat, agentMembers: string[]): Promise<void> {
    const absent = message.mentions.filter((h) => !agentMembers.includes(h));
    for (const handle of absent) {
      const profile = await this.deps.agents.get(handle);
      if (!profile) {
        const known = (await this.deps.agents.list()).map((a) => `@${a.handle}`).join(", ");
        await this.postSystem(
          chat.id,
          `There is no agent @${handle}. Agents: ${known}.`,
          message.topicId,
        );
        continue;
      }
      const chats = await this.deps.repo.chatsOfAgent(handle);
      const titles: string[] = [];
      for (const id of chats) {
        const found = await this.deps.repo.findChat(id);
        if (found) titles.push(`"${found.title}"`);
      }
      const where =
        titles.length > 0
          ? `Write to it in ${titles.join(", ")}, or ask the orchestrator to add it to this project.`
          : chat.kind === "group"
            ? "Ask the orchestrator to add it to this project."
            : "It is not in any chat yet: ask the orchestrator to start a project with it.";
      await this.postSystem(
        chat.id,
        `@${handle} is not in this chat, so it did not get your message. ${where}`,
        message.topicId,
      );
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
        (p) =>
          !(p.handle === handle && p.chat.id === chat.id && p.trigger.topicId === trigger.topicId),
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
        this.deps.afterRun?.(chat, trigger.topicId);
        const next = this.queues.get(lane)?.shift();
        if (next) {
          this.trigger(next.handle, next.chat, next.trigger, next.team, next.reason);
        } else {
          this.settleIfIdle();
        }
      });
  }

  private async postSystem(chatId: string, body: string, topicId: string | null): Promise<void> {
    await this.deps.repo.createMessage({
      chatId,
      topicId,
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
        trigger.topicId,
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
        trigger.topicId,
      );
      return;
    }

    // Guard: budgets per agent and per project, in dollars and in tokens (ADR 0023).
    const project = chat.projectId ? await this.deps.projects.get(chat.projectId) : null;
    const agentTotals = await runs.spentByAgent(handle);
    const agentSpent = agentTotals.usd;
    const agentSpend: Spend = {
      spentUsd: agentTotals.usd,
      spentTokens: agentTotals.tokens,
      budgetUsd: profile.budgetUsd,
      budgetTokens: profile.budgetTokens ?? null,
    };
    const projectSpend: Spend | null = project
      ? {
          spentUsd: project.spentUsd,
          spentTokens: project.spentTokens,
          budgetUsd: project.budgetUsd,
          budgetTokens: project.budgetTokens,
        }
      : null;
    if (spendLevel(agentSpend) === "stop") {
      await this.postSystem(
        chat.id,
        `💸 @${handle} is out of budget (${budgetText({ usd: profile.budgetUsd, tokens: profile.budgetTokens ?? null })}). Raise or remove its limit on the Agents page.`,
        trigger.topicId,
      );
      return;
    }
    if (project && projectSpend && spendLevel(projectSpend) === "stop") {
      await this.postSystem(
        chat.id,
        `💸 The project budget (${budgetText({ usd: project.budgetUsd, tokens: project.budgetTokens })}) is used up. @${handle} was not started. Raise or remove it from the budget button in the chat header.`,
        trigger.topicId,
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
      topicId: trigger.topicId,
      chainDepth: depth,
      runId,
    });
    await runs.attachReply(runId, reply.id);

    const cwd = project?.workspace ?? this.deps.scratchDir;
    mkdirSync(cwd, { recursive: true });
    const headBefore = project ? await headOf(project.workspace) : null;
    // A topic is its own conversation: agents see only its messages and summary (ADR 0024).
    const history = await repo.listMessages(chat.id, {
      limit: CONTEXT_WINDOW + SUMMARY_BATCH + 5,
      topic: trigger.topicId,
    });
    const topic = trigger.topicId ? await repo.getTopic(trigger.topicId) : null;
    const summary = await this.deps.chatSummary?.(chat.id, trigger.topicId).catch((e: unknown) => {
      log.warn("chat summary unavailable", { chat: chat.id, error: errorMessage(e) });
      return null;
    });
    const prompt =
      buildPrompt({
        agentHandle: handle,
        chatTitle: topic ? `${chat.title} › ${topic.title}` : chat.title,
        history,
        trigger,
        ownerName: this.deps.ownerName,
        summary,
      }) + wakeNote(reason, handle, team, this.deps.ownerName);

    const granted = toolsFor(profile, project !== null);
    const ownEnv = granted.includes("Bash")
      ? (this.deps.agentEnv?.(profile) ?? { values: {}, missing: [] })
      : { values: {}, missing: [] };
    const shell =
      project && granted.includes("Bash")
        ? (this.deps.projectShell?.(project, handle, abort.signal, ownEnv.values) ?? null)
        : null;
    // In a container project the host shell is replaced, never offered alongside.
    const builtinTools = shell ? granted.filter((t) => t !== "Bash") : granted;
    const sandbox = shell ? null : (this.deps.sandboxPolicy?.(profile) ?? null);
    const webHosts = builtinTools.includes("WebFetch") ? this.deps.webHosts?.(profile) : undefined;
    const memoryNotes =
      (await this.deps.memoryPrompt?.({
        handle,
        projectId: chat.projectId,
        query: trigger.body,
      })) ?? "";

    const ownServers = this.deps.mcpServers?.(handle) ?? {};
    const mcpServers =
      project && this.deps.projectMcp
        ? await this.deps.projectMcp(project, ownServers)
        : ownServers;

    const hide = (t: string) => this.deps.redact?.(t) ?? t;
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
          (sandbox && builtinTools.includes("Bash") ? sandboxNote(sandbox) : "") +
          (webHosts ? webNote(webHosts) : "") +
          (shell?.note ?? "") +
          envNote(ownEnv) +
          memoryNotes +
          userNote(this.deps.ownerName, this.userLanguage),
        prompt,
        model: model ?? undefined,
        cwd,
        confineToCwd: true,
        builtinTools,
        sandbox: sandbox ?? undefined,
        tools: [
          ...this.deps.appTools({ handle, chat, depth, topicId: trigger.topicId }),
          ...(shell ? [shell.tool] : []),
        ],
        mcpServers,
        maxTurns: this.deps.maxTurns ?? 50,
        maxBudgetUsd,
        env: ownEnv.values,
        webHosts,
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
            summary: hide(summarize(event.input)),
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

    const rawBody = hide(text.trim());
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
    // Never an empty bubble: an answer without text says why (A8 in the alpha feedback).
    const emptyNote =
      !body && !silent && !error
        ? toolCalls.length > 0 || commit
          ? `@${handle} worked but wrote no reply.`
          : `The model returned an empty answer (${provider.id}${model ? `, ${model}` : ""}). Try again, or choose another model on the Engines page.`
        : null;
    const failed = Boolean(error) || (emptyNote !== null && toolCalls.length === 0 && !commit);
    const status = stopped ? "stopped" : failed ? "error" : "done";
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
            error: error ? error.message : emptyNote,
            card: toolCalls.length > 0 || commit ? card(status, commit) : null,
          });
    await runs.finish(runId, {
      status,
      tokensIn: usage?.inputTokens ?? 0,
      tokensOut: usage?.outputTokens ?? 0,
      costUsd: usage?.costUsd ?? 0,
      toolCalls: toolCalls.map(({ name, summary, isError }) => ({ name, summary, isError })),
      error: error?.message ?? emptyNote,
    });

    const cost = usage?.costUsd ?? 0;
    const tokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    if (project && projectSpend && crossedSpendWarning(projectSpend, cost, tokens)) {
      await this.postSystem(
        chat.id,
        `⚠️ 80% of the project budget is used (${formatTokens(project.spentTokens + tokens)} tokens; budget: ${budgetText({ usd: project.budgetUsd, tokens: project.budgetTokens })}).`,
        trigger.topicId,
      );
    }
    if (crossedSpendWarning(agentSpend, cost, tokens)) {
      await this.postSystem(chat.id, `⚠️ @${handle} used 80% of its budget.`, trigger.topicId);
    }

    // Mentions in a completed reply may wake other agents, one level deeper in the chain.
    if (final?.status === "final" && !stopped && body) this.deps.chat.notify(final, chat);
  }
}

/** What an agent with a shell is told about its own variables; values are never in the prompt. */
function envNote(env: { values: Record<string, string>; missing: string[] }): string {
  const names = Object.keys(env.values);
  if (names.length === 0 && env.missing.length === 0) return "";
  return `

## Your environment
${names.length > 0 ? `Your shell commands get these variables: ${names.join(", ")}. Use them by name (for example $${names[0]}); never print their values.` : ""}${env.missing.length > 0 ? ` These variables are configured but have no value: ${env.missing.join(", ")}. If you need them, ask the user to set them on the Integrations page.` : ""}`;
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

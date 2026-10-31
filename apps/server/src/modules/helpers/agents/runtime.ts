import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  budgetText,
  type Chat,
  formatTokens,
  type Message,
  parseMentions,
  type RunCard,
  type Usage,
} from "@aura/shared";
import { commitAll, git } from "../../../lib/git";
import { errorMessage, log } from "../../../lib/log";
import type { AgentEvent, AgentTool, SandboxPolicy } from "../../../providers/types";
import type { EngineSelector } from "../../ai/engines/registry";
import type { ChatRepo } from "../../chats/chat/repo";
import type { ChatService } from "../../chats/chat/service";
import type { FileStore } from "../../chats/files/store";
import type { ProjectInfo } from "../../chats/projects/service";
import type { EventHub } from "../../system/realtime/hub";
import { buildPrompt, CONTEXT_WINDOW } from "./context";
import { wakeNote } from "./defaults";
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
import { joinPrompt, type PromptPart, systemPromptParts } from "./prompt";
import type { RunRepo } from "./runs";
import { agentsToTrigger, type WakeReason } from "./triggers";

export interface ProjectLookup {
  get(slug: string): Promise<ProjectInfo | null>;
}

export interface RuntimeDeps {
  /** False while the Chats app is off (ADR 0027): no message wakes an agent. */
  enabled?: () => boolean;
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
    /** The run answers the user's own message (not an agent, an alert or a schedule). */
    byUser: boolean;
  }) => AgentTool[] | Promise<AgentTool[]>;
  /** Extra system prompt parts for an agent (its skills, the Aura guide). */
  promptExtras?: (profile: AgentProfile) => PromptPart[];
  /** The OS sandbox for shell commands (no network), or null to run them without it (ADR 0015). */
  sandboxPolicy?: (profile: AgentProfile) => SandboxPolicy | null;
  /** The language the user chose for Aura (its English name), or null to follow their messages. */
  language?: () => Promise<string | null>;
  /** Hides secret values in text shown in chat. */
  redact?: (text: string) => string;
  /** After a run in an app's chat: offer the agent's changes for approval (ADR 0024). */
  appRun?: (
    project: ProjectInfo,
    run: { handle: string; chatId: string; summary: string; depth: number },
  ) => Promise<void>;
  ownerName: string;
  /** Working directory for runs outside a project. */
  scratchDir: string;
  /** Files attached to chats; staged in the run's working folder for the agent (ADR 0036). */
  files?: FileStore;
  maxChainDepth?: number;
  maxTurns?: number;
}

interface ActiveRun {
  runId: string;
  chatId: string;
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
/** Agents get no variables of their own any more (ADR 0042). */
const NO_ENV = { values: {}, missing: [] };

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

  /**
   * The system prompt an agent runs with now, part by part (ADR 0032); team rules are shown as in
   * a project chat.
   */
  async explainPrompt(handle: string): Promise<PromptPart[] | null> {
    const profile = await this.deps.agents.get(handle);
    if (!profile) return null;
    const granted = toolsFor(profile, false);
    const sandbox = this.deps.sandboxPolicy?.(profile) ?? null;
    return systemPromptParts({
      profile,
      team: [handle, "…"],
      extras: this.deps.promptExtras?.(profile) ?? [],
      sandbox: sandbox !== null && granted.includes("Bash"),
      env: NO_ENV,
      memory: "",
      ownerName: this.deps.ownerName,
      language: (await this.deps.language?.()) ?? this.userLanguage,
    });
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

  /** Whether a helper is working in the chat right now (it cannot be deleted then). */
  busyIn(chatId: string): boolean {
    for (const run of this.active.values()) if (run.chatId === chatId) return true;
    return false;
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
    if (this.deps.enabled?.() === false) return;
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
        await this.postSystem(chat.id, `There is no agent @${handle}. Agents: ${known}.`);
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
      );
    }
  }

  /**
   * Chat files in the prompt's window are copied into the run's working folder under
   * `attachments/`, where the agent's file tools can read them (ADR 0036). In a project they are
   * kept out of its git history: a PDF is not a change.
   */
  private stageAttachments(chat: Chat, messages: Message[], cwd: string, inProject: boolean): void {
    const files = this.deps.files;
    const wanted = messages.flatMap((m) => m.attachments);
    if (!files || wanted.length === 0) return;
    for (const file of new Map(wanted.map((f) => [f.id, f])).values()) {
      try {
        files.stage({ kind: "chat", id: chat.id }, file.id, cwd);
      } catch (error) {
        log.warn("attachment not staged", {
          chat: chat.id,
          file: file.id,
          error: errorMessage(error),
        });
      }
    }
    if (!inProject) return;
    const ignore = join(cwd, ".gitignore");
    const lines = existsSync(ignore) ? readFileSync(ignore, "utf8").split("\n") : [];
    if (!lines.includes("attachments/"))
      appendFileSync(ignore, `${lines.length ? "\n" : ""}attachments/\n`);
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
    const run: ActiveRun = { runId: "", chatId: chat.id, abort: new AbortController() };
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
        } else {
          this.settleIfIdle();
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
      );
      return;
    }
    if (project && projectSpend && spendLevel(projectSpend) === "stop") {
      await this.postSystem(
        chat.id,
        `💸 The project budget (${budgetText({ usd: project.budgetUsd, tokens: project.budgetTokens })}) is used up. @${handle} was not started. Raise or remove it from the budget button in the chat header.`,
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
    this.stageAttachments(chat, [...history, trigger], cwd, project !== null);
    const prompt =
      buildPrompt({
        agentHandle: handle,
        chatTitle: chat.title,
        history,
        trigger,
        ownerName: this.deps.ownerName,
      }) + wakeNote(reason, handle, team, this.deps.ownerName);

    const granted = toolsFor(profile, project !== null);
    const builtinTools = granted;
    const sandbox = this.deps.sandboxPolicy?.(profile) ?? null;

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
        systemPrompt: joinPrompt(
          systemPromptParts({
            profile,
            team: project !== null ? team : null,
            extras: this.deps.promptExtras?.(profile) ?? [],
            sandbox: sandbox !== null && builtinTools.includes("Bash"),
            env: NO_ENV,
            memory: "",
            ownerName: this.deps.ownerName,
            language: (await this.deps.language?.()) ?? this.userLanguage,
          }),
        ),
        prompt,
        model: model ?? undefined,
        cwd,
        confineToCwd: true,
        builtinTools,
        sandbox: sandbox ?? undefined,
        tools: [
          ...(await this.deps.appTools({
            handle,
            chat,
            depth,
            byUser: trigger.author.kind === "user",
          })),
        ],
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
    if (project?.kind === "app") {
      // An app's code changes only with the user's approval: the edits wait as a draft and the
      // user gets the diff on a card (ADR 0024).
      await this.deps
        .appRun?.(project, {
          handle,
          chatId: chat.id,
          summary: body || "Changes to the app",
          depth,
        })
        .catch((e: unknown) =>
          log.error("app change card failed", { project: project.id, error: errorMessage(e) }),
        );
    } else if (project) {
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
      );
    }
    if (crossedSpendWarning(agentSpend, cost, tokens)) {
      await this.postSystem(chat.id, `⚠️ @${handle} used 80% of its budget.`);
    }

    // Mentions in a completed reply may wake other agents, one level deeper in the chain.
    if (final?.status === "final" && !stopped && body) this.deps.chat.notify(final, chat);
  }
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

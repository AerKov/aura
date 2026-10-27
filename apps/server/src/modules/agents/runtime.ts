import { type Chat, type Message, parseMentions, type Usage } from "@aura/shared";
import { errorMessage, log } from "../../lib/log";
import type { AgentEvent, LLMProvider } from "../../providers/types";
import type { ChatRepo } from "../chat/repo";
import type { ChatService } from "../chat/service";
import type { EventHub } from "../realtime/hub";
import { buildPrompt, CONTEXT_WINDOW } from "./context";
import { type AgentProfile, ORCHESTRATOR, ORCHESTRATOR_HANDLE } from "./profiles";
import type { RunRepo } from "./runs";
import { agentsToTrigger } from "./triggers";

export interface AgentDirectory {
  get(handle: string): Promise<AgentProfile | null>;
}

/** Phase 2 directory: only the built-in orchestrator. */
export const builtinDirectory: AgentDirectory = {
  async get(handle) {
    return handle === ORCHESTRATOR_HANDLE ? ORCHESTRATOR : null;
  },
};

export interface RuntimeDeps {
  chat: ChatService;
  repo: ChatRepo;
  runs: RunRepo;
  hub: EventHub;
  provider: LLMProvider;
  agents: AgentDirectory;
  ownerName: string;
  defaultModel?: string;
}

interface ActiveRun {
  runId: string;
  abort: AbortController;
}

/**
 * Runs agents in response to chat messages: guards, context, streaming into the chat, persisting
 * the final reply once, and recording usage (docs/SPEC.md section 7, run lifecycle).
 */
export class AgentRuntime {
  /** One active run per agent per chat (SPEC section 8, rule 4). Key: `handle@chatId`. */
  private readonly active = new Map<string, ActiveRun>();
  /** Latest message that arrived while the agent was busy in that chat; answered afterwards. */
  private readonly queued = new Map<string, { chat: Chat; trigger: Message }>();
  private readonly idleWaiters = new Set<() => void>();

  constructor(private readonly deps: RuntimeDeps) {}

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
    for (const run of this.active.values()) run.abort.abort();
    this.queued.clear();
  }

  private async onMessage(message: Message, chat: Chat): Promise<void> {
    const members = await this.deps.repo.members(chat.id);
    const agentMembers = members
      .filter((m) => m.participant.kind === "agent")
      .map((m) => m.participant.id);
    const targets = agentsToTrigger({
      message,
      chat,
      agentMembers,
      orchestrator: ORCHESTRATOR_HANDLE,
    });
    for (const handle of targets) this.trigger(handle, chat, message);
  }

  private trigger(handle: string, chat: Chat, trigger: Message): void {
    const key = `${handle}@${chat.id}`;
    if (this.active.has(key)) {
      this.queued.set(key, { chat, trigger });
      return;
    }
    const abort = new AbortController();
    this.active.set(key, { runId: "", abort });
    void this.execute(handle, chat, trigger, abort)
      .catch((error: unknown) => {
        log.error("agent run crashed", {
          agent: handle,
          chat: chat.id,
          error: errorMessage(error),
        });
      })
      .finally(() => {
        this.active.delete(key);
        const next = this.queued.get(key);
        if (next) {
          this.queued.delete(key);
          this.trigger(handle, next.chat, next.trigger);
        } else if (this.active.size === 0) {
          for (const resolve of this.idleWaiters) resolve();
          this.idleWaiters.clear();
        }
      });
  }

  private async execute(
    handle: string,
    chat: Chat,
    trigger: Message,
    abort: AbortController,
  ): Promise<void> {
    const { repo, runs, hub, provider } = this.deps;
    const profile = await this.deps.agents.get(handle);
    if (!profile) {
      log.warn("mentioned agent has no profile", { agent: handle });
      return;
    }

    const model = profile.model ?? this.deps.defaultModel ?? null;
    const runId = await runs.start({
      agent: handle,
      chatId: chat.id,
      projectId: chat.projectId,
      triggerMessageId: trigger.id,
      provider: provider.id,
      model,
    });
    const activeRun = this.active.get(`${handle}@${chat.id}`);
    if (activeRun) activeRun.runId = runId;

    const reply = await repo.createMessage({
      chatId: chat.id,
      author: { kind: "agent", id: handle },
      body: "",
      status: "streaming",
      replyTo: chat.kind === "direct" ? null : trigger.id,
      chainDepth: trigger.chainDepth + 1,
      runId,
    });
    await runs.attachReply(runId, reply.id);

    const history = await repo.listMessages(chat.id, { limit: CONTEXT_WINDOW + 5 });
    const prompt = buildPrompt({
      agentHandle: handle,
      chatTitle: chat.title,
      history,
      trigger,
      ownerName: this.deps.ownerName,
    });

    let text = "";
    let usage: Usage | null = null;
    let error: (AgentEvent & { type: "error" }) | null = null;
    const toolCalls: { id: string; name: string; summary: string; isError: boolean }[] = [];

    for await (const event of provider.run(
      {
        runId,
        systemPrompt: profile.systemPrompt,
        prompt,
        model: model ?? undefined,
        builtinTools: profile.builtinTools,
        tools: [],
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
          break;
        case "tool-result": {
          const call = toolCalls.find((c) => c.id === event.id);
          if (call) call.isError = event.isError ?? false;
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

    const stopped = error?.code === "aborted";
    const body = text.trim();
    const final = await repo.updateMessage(reply.id, {
      body,
      mentions: parseMentions(body),
      status: body && !error ? "final" : body && stopped ? "final" : "error",
      usage,
      error: error ? error.message : null,
    });
    await runs.finish(runId, {
      status: stopped ? "stopped" : error ? "error" : "done",
      tokensIn: usage?.inputTokens ?? 0,
      tokensOut: usage?.outputTokens ?? 0,
      costUsd: usage?.costUsd ?? 0,
      toolCalls: toolCalls.map(({ name, summary, isError }) => ({ name, summary, isError })),
      error: error?.message ?? null,
    });

    // Mentions in a completed reply may wake other agents (Phase 3 adds chain-depth guards).
    if (final.status === "final") this.deps.chat.notify(final, chat);
  }
}

function summarize(input: unknown): string {
  try {
    const text = JSON.stringify(input);
    return text.length > 160 ? `${text.slice(0, 159)}…` : text;
  } catch {
    return "";
  }
}

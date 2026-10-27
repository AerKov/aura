import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type Client,
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type ToolKind,
} from "@agentclientprotocol/sdk";
import { errorMessage, log } from "../lib/log";
import { resolveInside } from "./native-tools";
import type {
  AgentEvent,
  AgentRunInput,
  LLMProvider,
  McpServerSpec,
  ProviderStatus,
} from "./types";

/**
 * External coding agents over the Agent Client Protocol (ACP, ADR 0012): Gemini CLI, Codex,
 * OpenCode. Each run starts the agent's own CLI under the user's own login for that service. Aura is
 * the ACP client: it streams the agent's messages into the chat, decides every permission request,
 * serves file reads and writes inside the workspace, and gives the agent the app's tools over MCP.
 */
export interface AcpAgentSpec {
  id: string;
  label: string;
  /** The command that speaks ACP on stdio, or null when the CLI is not installed. */
  command: () => { command: string; args: string[] } | null;
  /** Extra arguments that pick a model, when the CLI takes it on the command line. */
  modelArgs?: (model: string) => string[];
  installHint: string;
  loginHint: string;
}

export interface AcpProviderDeps {
  /** Serves the run's app tools as an MCP server over HTTP. */
  toolBridge?: {
    open(runId: string, tools: AgentRunInput["tools"]): { url: string; close(): void };
  };
  appVersion: string;
  /** Starts the agent process; tests replace it. */
  spawn?: (cmd: string[], cwd: string, env: Record<string, string>) => AgentProcess;
}

export interface AgentProcess {
  stdin: WritableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
  kill(): void;
  exited: Promise<number>;
}

/** Built-in tools Aura grants, by ACP tool kind (Claude Code names, as in agent profiles). */
const KIND_TOOLS: Record<ToolKind, string[] | "allow" | "deny"> = {
  read: ["Read", "Grep", "Glob", "Edit", "Write"],
  search: ["Grep", "Glob", "Read"],
  edit: ["Edit", "Write"],
  delete: ["Edit", "Write"],
  move: ["Edit", "Write"],
  execute: ["Bash"],
  fetch: ["WebFetch", "WebSearch"],
  think: "allow",
  // Switching modes could turn on the agent's own auto-approval and bypass these checks.
  switch_mode: "deny",
  // MCP tools: only the app's tools and the MCP servers granted to this agent are configured.
  other: "allow",
};

export type PermissionDecision = { allow: true } | { allow: false; reason: string };

/** Decides an ACP permission request against the agent's grants and workspace (sandbox level 0). */
export function decidePermission(
  toolCall: RequestPermissionRequest["toolCall"],
  granted: readonly string[],
  cwd: string | undefined,
): PermissionDecision {
  const kind: ToolKind = toolCall.kind ?? "other";
  const rule = KIND_TOOLS[kind] ?? "deny";
  if (rule === "deny") return { allow: false, reason: `${kind} is not allowed` };
  if (rule !== "allow" && !rule.some((tool) => granted.includes(tool))) {
    return {
      allow: false,
      reason: `${toolCall.title ?? kind} needs ${rule[0]}, which this agent was not granted`,
    };
  }
  if (cwd) {
    for (const location of toolCall.locations ?? []) {
      try {
        resolveInside(cwd, location.path);
      } catch {
        return { allow: false, reason: `${location.path} is outside the project workspace` };
      }
    }
  }
  return { allow: true };
}

function choose(
  request: RequestPermissionRequest,
  decision: PermissionDecision,
): RequestPermissionResponse {
  // Never "always": every call is checked again.
  const kind = decision.allow ? "allow_once" : "reject_once";
  const option = request.options.find((o) => o.kind === kind);
  return option
    ? { outcome: { outcome: "selected", optionId: option.optionId } }
    : { outcome: { outcome: "cancelled" } };
}

/** The agent gets the user's environment (its own login), minus Aura's settings. */
function agentEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("AURA_")) env[key] = value;
  }
  return env;
}

function defaultSpawn(cmd: string[], cwd: string, env: Record<string, string>): AgentProcess {
  const proc = Bun.spawn(cmd, { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  void new Response(proc.stderr).text().then((text) => {
    if (text.trim()) log.debug("agent stderr", { cmd: cmd[0], text: text.slice(-1500) });
  });
  const stdin = new WritableStream<Uint8Array>({
    write(chunk) {
      proc.stdin.write(chunk);
      proc.stdin.flush();
    },
    close() {
      proc.stdin.end();
    },
  });
  return { stdin, stdout: proc.stdout, kill: () => proc.kill(), exited: proc.exited };
}

/** A small async queue the ACP callbacks push into and the run generator drains. */
class EventQueue {
  private items: AgentEvent[] = [];
  private wake: (() => void) | null = null;
  ended = false;

  push(event: AgentEvent): void {
    this.items.push(event);
    this.wake?.();
  }

  end(): void {
    this.ended = true;
    this.wake?.();
  }

  async *drain(): AsyncGenerator<AgentEvent> {
    while (true) {
      const item = this.items.shift();
      if (item) {
        yield item;
        continue;
      }
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      this.wake = null;
    }
  }
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (record.content !== undefined) return textOf(record.content);
    if (typeof record.output === "string") return record.output;
  }
  return "";
}

export class AcpProvider implements LLMProvider {
  readonly id: string;

  constructor(
    private readonly spec: AcpAgentSpec,
    private readonly deps: AcpProviderDeps,
  ) {
    this.id = spec.id;
  }

  /** Installed and speaks ACP: starts the CLI and runs the `initialize` handshake (no tokens). */
  async isAvailable(): Promise<ProviderStatus> {
    const command = this.spec.command();
    if (!command)
      return { ok: false, reason: `${this.spec.label} is not installed. ${this.spec.installHint}` };
    const proc = (this.deps.spawn ?? defaultSpawn)(
      [command.command, ...command.args],
      process.cwd(),
      agentEnv(),
    );
    const connection = new ClientSideConnection(
      () => ({
        requestPermission: async () => ({ outcome: { outcome: "cancelled" } }),
        sessionUpdate: async () => {},
      }),
      ndJsonStream(proc.stdin, proc.stdout),
    );
    try {
      const info = await withTimeout(
        connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} }),
        20_000,
      );
      const version = info.agentInfo?.version ? ` ${info.agentInfo.version}` : "";
      return { ok: true, detail: `${info.agentInfo?.title ?? this.spec.label}${version}` };
    } catch (error) {
      return { ok: false, reason: `${this.spec.label} did not start: ${errorMessage(error)}` };
    } finally {
      proc.kill();
    }
  }

  async *run(input: AgentRunInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const command = this.spec.command();
    if (!command) {
      yield {
        type: "error",
        message: `${this.spec.label} is not installed. ${this.spec.installHint}`,
        code: "auth",
      };
      return;
    }
    const cwd = input.cwd ?? process.cwd();
    const confine = input.confineToCwd ? cwd : undefined;
    const args = [
      ...command.args,
      ...(input.model && this.spec.modelArgs ? this.spec.modelArgs(input.model) : []),
    ];
    const proc = (this.deps.spawn ?? defaultSpawn)([command.command, ...args], cwd, {
      ...agentEnv(),
      ...(input.env ?? {}),
    });
    const endpoint =
      input.tools.length > 0 ? this.deps.toolBridge?.open(input.runId, input.tools) : undefined;
    const queue = new EventQueue();
    const calls = new Map<string, { done: boolean }>();
    let sawText = false;
    let lastWasTool = false;
    let costUsd: number | undefined;
    let sessionId: string | null = null;
    let budgetHit = false;

    const callStarted = (id: string, name: string, payload: unknown) => {
      if (calls.has(id)) return;
      calls.set(id, { done: false });
      lastWasTool = true;
      queue.push({ type: "tool-call", id, name, input: payload });
    };

    const client: Client = {
      requestPermission: async (request) => {
        const decision = decidePermission(request.toolCall, input.builtinTools, confine);
        if (!decision.allow) {
          log.warn("tool use denied", {
            run: input.runId,
            tool: request.toolCall.title,
            reason: decision.reason,
          });
        }
        return choose(request, decision);
      },
      sessionUpdate: async ({ update }: SessionNotification) => {
        switch (update.sessionUpdate) {
          case "agent_message_chunk": {
            if (update.content.type !== "text" || !update.content.text) return;
            if (sawText && lastWasTool) queue.push({ type: "text-delta", text: "\n\n" });
            sawText = true;
            lastWasTool = false;
            queue.push({ type: "text-delta", text: update.content.text });
            return;
          }
          case "tool_call":
            callStarted(
              update.toolCallId,
              update.title || update.kind || "tool",
              update.rawInput ?? update.locations ?? {},
            );
            if (update.status === "completed" || update.status === "failed") {
              calls.set(update.toolCallId, { done: true });
              queue.push({
                type: "tool-result",
                id: update.toolCallId,
                output: textOf(update.content ?? update.rawOutput),
                isError: update.status === "failed",
              });
            }
            return;
          case "tool_call_update": {
            callStarted(
              update.toolCallId,
              update.title || update.kind || "tool",
              update.rawInput ?? {},
            );
            const call = calls.get(update.toolCallId);
            if (
              call &&
              !call.done &&
              (update.status === "completed" || update.status === "failed")
            ) {
              call.done = true;
              queue.push({
                type: "tool-result",
                id: update.toolCallId,
                output: textOf(update.content ?? update.rawOutput),
                isError: update.status === "failed",
              });
            }
            return;
          }
          case "usage_update":
            if (update.cost && update.cost.currency.toUpperCase() === "USD") {
              costUsd = update.cost.amount;
              if (input.maxBudgetUsd !== undefined && costUsd >= input.maxBudgetUsd && sessionId) {
                budgetHit = true;
                void connection.cancel({ sessionId });
              }
            }
            return;
          default:
            return;
        }
      },
      readTextFile: async ({ path, line, limit }) => {
        const file = confine ? resolveInside(confine, path) : path;
        const lines = readFileSync(file, "utf8").split("\n");
        const start = line ? line - 1 : 0;
        return { content: lines.slice(start, limit ? start + limit : undefined).join("\n") };
      },
      writeTextFile: async ({ path, content }) => {
        if (!input.builtinTools.includes("Write") && !input.builtinTools.includes("Edit")) {
          throw new Error("This agent was not granted Write");
        }
        const file = confine ? resolveInside(confine, path) : path;
        mkdirSync(dirname(file), { recursive: true });
        await Bun.write(file, content);
        return {};
      },
    };
    const connection = new ClientSideConnection(
      () => client,
      ndJsonStream(proc.stdin, proc.stdout),
    );

    const onAbort = () => {
      if (sessionId) void connection.cancel({ sessionId }).catch(() => {});
      setTimeout(() => proc.kill(), 3000).unref?.();
    };
    signal.addEventListener("abort", onAbort, { once: true });

    let result: AgentEvent[] = [];
    const work = (async () => {
      const init = await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
        clientInfo: { name: "aura", version: this.deps.appVersion },
      });
      const mcpServers = toAcpServers(input.mcpServers ?? {});
      if (endpoint) {
        if (init.agentCapabilities?.mcpCapabilities?.http) {
          mcpServers.unshift({ type: "http", name: "aura", url: endpoint.url, headers: [] });
        } else {
          log.warn("agent cannot reach app tools (no MCP over HTTP)", {
            run: input.runId,
            agent: this.id,
          });
        }
      }
      const session = await connection.newSession({ cwd, mcpServers });
      sessionId = session.sessionId;
      if (input.model && !this.spec.modelArgs)
        await this.selectModel(connection, session, input.model);
      if (signal.aborted) throw new Error("aborted");
      const response = await connection.prompt({
        sessionId: session.sessionId,
        prompt: [
          {
            type: "text",
            text: `<instructions>\n${input.systemPrompt}\n</instructions>\n\n${input.prompt}`,
          },
        ],
      });
      const usage: AgentEvent = {
        type: "usage",
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
        costUsd,
      };
      switch (response.stopReason) {
        case "end_turn":
          result = [usage, { type: "done" }];
          break;
        case "cancelled":
          result = [
            usage,
            budgetHit
              ? { type: "error", message: "Stopped: the run reached its budget.", code: "budget" }
              : { type: "error", message: "Stopped", code: "aborted" },
          ];
          break;
        case "max_tokens":
        case "max_turn_requests":
          result = [
            usage,
            { type: "error", message: "Stopped: the agent reached its limit.", code: "max_turns" },
          ];
          break;
        default:
          result = [
            usage,
            { type: "error", message: `${this.spec.label} refused to continue.`, code: "other" },
          ];
      }
    })()
      .catch((error: unknown) => {
        const message = acpErrorText(error);
        if (signal.aborted) {
          result = [{ type: "error", message: "Stopped", code: "aborted" }];
        } else if (
          (error instanceof RequestError && error.code === -32000) ||
          /auth|login|credential|api key|unauthor/i.test(message)
        ) {
          result = [
            {
              type: "error",
              message: `${this.spec.label} is not logged in. ${this.spec.loginHint}`,
              code: "auth",
            },
          ];
        } else {
          log.error("acp run failed", { run: input.runId, agent: this.id, error: message });
          result = [{ type: "error", message: `${this.spec.label}: ${message}`, code: "other" }];
        }
      })
      .finally(() => queue.end());

    // If the agent dies, the connection never answers: end the run instead of hanging.
    void proc.exited.then((code) => {
      if (!queue.ended) {
        setTimeout(() => {
          if (!queue.ended) {
            result = signal.aborted
              ? [{ type: "error", message: "Stopped", code: "aborted" }]
              : [
                  {
                    type: "error",
                    message: `${this.spec.label} exited (code ${code}).`,
                    code: "other",
                  },
                ];
            queue.end();
          }
        }, 500);
      }
    });

    try {
      yield* queue.drain();
      await Promise.race([work, Bun.sleep(100)]);
      yield* result;
    } finally {
      signal.removeEventListener("abort", onAbort);
      endpoint?.close();
      proc.kill();
    }
  }

  private async selectModel(
    connection: ClientSideConnection,
    session: Awaited<ReturnType<ClientSideConnection["newSession"]>>,
    model: string,
  ): Promise<void> {
    const option = session.configOptions?.find(
      (o) => o.category === "model" && o.type === "select",
    );
    if (!option) {
      log.warn("agent does not offer a model choice", { agent: this.id, model });
      return;
    }
    await connection.setSessionConfigOption({
      sessionId: session.sessionId,
      configId: option.id,
      value: model,
    });
  }
}

type AcpServer = Parameters<ClientSideConnection["newSession"]>[0]["mcpServers"][number];

function toAcpServers(servers: Record<string, McpServerSpec>): AcpServer[] {
  return Object.entries(servers).map(
    ([name, spec]): AcpServer =>
      spec.type === "http"
        ? {
            type: "http",
            name,
            url: spec.url,
            headers: Object.entries(spec.headers ?? {}).map(([n, value]) => ({ name: n, value })),
          }
        : {
            name,
            command: spec.command,
            args: spec.args,
            env: Object.entries(spec.env).map(([key, value]) => ({ name: key, value })),
          },
  );
}

/** JSON-RPC errors carry the useful detail in `data` ("Internal error" alone says nothing). */
function acpErrorText(error: unknown): string {
  if (!(error instanceof RequestError) || error.data === undefined) return errorMessage(error);
  const data = error.data;
  const detail =
    typeof data === "string"
      ? data
      : data && typeof data === "object" && "details" in data && typeof data.details === "string"
        ? data.details
        : JSON.stringify(data);
  return `${error.message}: ${detail.slice(0, 300)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms),
    ),
  ]);
}

import {
  type CanUseTool,
  createSdkMcpServer,
  type Options,
  query,
  type SDKMessage,
  type SDKUserMessage,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { errorMessage, log } from "../lib/log";
import { decideToolUse } from "./confine";
import type {
  AgentEvent,
  AgentRunInput,
  AgentTool,
  LLMProvider,
  ProviderErrorCode,
  ProviderStatus,
  SandboxPolicy,
} from "./types";

const APP_MCP_SERVER = "aura";

/** Assistant/auth errors that mean the user has to fix their Claude Code setup. */
const AUTH_ERRORS = new Set([
  "authentication_failed",
  "oauth_org_not_allowed",
  "account_on_hold",
  "verification_required",
  "billing_error",
  "cloud_credential_error",
]);

/**
 * Runs agents through the official Claude Agent SDK, which spawns Claude Code under the user's own
 * login. The app never reads, stores or forwards Claude credentials (CLAUDE.md rule 4).
 */
export class ClaudeAgentSdkProvider implements LLMProvider {
  readonly id = "claude-agent-sdk";
  private authProblem: string | null = null;

  constructor(
    private readonly opts: {
      /**
       * The user's Claude Code executable. `undefined` lets the SDK use its own bundled copy (dev
       * only); `null` means none was found, so the provider reports "not installed".
       */
      executablePath?: string | null;
      defaultModel?: string;
    } = {},
  ) {}

  async isAvailable(): Promise<ProviderStatus> {
    if (this.opts.executablePath === null) {
      return {
        ok: false,
        reason: "Claude Code is not installed (the `claude` command was not found).",
      };
    }
    if (this.authProblem) return { ok: false, reason: this.authProblem };
    // Starting a session without sending a prompt checks that Claude Code runs, at no token cost.
    const abort = new AbortController();
    const q = query({
      prompt: idlePrompt(abort.signal),
      options: this.baseOptions({ abortController: abort, tools: [] }),
    });
    try {
      const info = await withTimeout(q.accountInfo(), 20_000);
      return { ok: true, detail: info.subscriptionType ?? info.apiProvider };
    } catch (error) {
      return { ok: false, reason: `Claude Code could not start: ${errorMessage(error)}` };
    } finally {
      abort.abort();
      q.close();
    }
  }

  /** Clears a remembered auth problem, e.g. after the user says they logged in. */
  resetStatus(): void {
    this.authProblem = null;
  }

  async *run(input: AgentRunInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    if (this.opts.executablePath === null) {
      yield { type: "error", message: "Claude Code is not installed.", code: "auth" };
      return;
    }
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    const mcpServers: Options["mcpServers"] = {};
    const appTools = input.tools.map((t) => `mcp__${APP_MCP_SERVER}__${t.name}`);
    if (input.tools.length > 0) {
      mcpServers[APP_MCP_SERVER] = createSdkMcpServer({
        name: APP_MCP_SERVER,
        version: "0.0.0",
        tools: input.tools.map(toSdkTool),
      });
    }
    for (const [name, spec] of Object.entries(input.mcpServers ?? {})) {
      mcpServers[name] =
        spec.type === "http"
          ? { type: "http", url: spec.url, headers: spec.headers ?? {} }
          : { type: "stdio", command: spec.command, args: spec.args, env: spec.env };
    }
    const allowedPrefixes = Object.keys(input.mcpServers ?? {}).map((name) => `mcp__${name}__`);
    // Every tool call outside the app's own tools goes through this check.
    const canUseTool: CanUseTool = async (toolName, args, { blockedPath }) => {
      const decision = decideToolUse({
        tool: toolName,
        args,
        granted: input.builtinTools,
        appTools,
        allowedPrefixes,
        cwd: input.confineToCwd ? input.cwd : undefined,
        blockedPath,
      });
      if (decision.allow) return { behavior: "allow", updatedInput: args };
      log.warn("tool use denied", { run: input.runId, tool: toolName, reason: decision.reason });
      return { behavior: "deny", message: decision.reason };
    };

    const q = query({
      prompt: input.prompt,
      options: this.baseOptions({
        abortController: abort,
        systemPrompt: input.systemPrompt,
        model: input.model ?? this.opts.defaultModel,
        cwd: input.cwd,
        tools: input.builtinTools,
        allowedTools: appTools,
        canUseTool,
        mcpServers,
        maxTurns: input.maxTurns,
        maxBudgetUsd: input.maxBudgetUsd,
        ...(input.sandbox ? { sandbox: claudeSandbox(input.sandbox) } : {}),
        // Claude Code's Bash inherits its environment: the agent's own variables join it.
        ...(input.env && Object.keys(input.env).length > 0
          ? { env: { ...process.env, ...input.env } }
          : {}),
        includePartialMessages: true,
        // Nothing is pre-approved except app tools; canUseTool decides the rest.
        permissionMode: "default",
      }),
    });

    let sawText = false;
    try {
      for await (const message of q) {
        yield* this.translate(
          message,
          () => {
            sawText = true;
          },
          sawText,
        );
      }
      yield { type: "done" };
    } catch (error) {
      if (signal.aborted) {
        yield { type: "error", message: "Stopped", code: "aborted" };
      } else {
        log.error("agent sdk run failed", { run: input.runId, error: errorMessage(error) });
        yield { type: "error", message: errorMessage(error), code: "other" };
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      q.close();
    }
  }

  private *translate(
    message: SDKMessage,
    markText: () => void,
    sawText: boolean,
  ): Iterable<AgentEvent> {
    switch (message.type) {
      case "stream_event": {
        // Only the top-level agent's text goes to the chat; subagent output stays in tool results.
        if (message.parent_tool_use_id) return;
        const event = message.event;
        if (
          event.type === "content_block_start" &&
          event.content_block.type === "text" &&
          sawText
        ) {
          // A new text block after tool use: keep paragraphs apart.
          yield { type: "text-delta", text: "\n\n" };
        }
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          markText();
          yield { type: "text-delta", text: event.delta.text };
        }
        return;
      }
      case "assistant": {
        if (message.error && AUTH_ERRORS.has(message.error)) {
          this.authProblem = authHint(message.error);
          yield { type: "error", message: this.authProblem, code: "auth" };
          return;
        }
        if (message.parent_tool_use_id) return;
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            yield {
              type: "tool-call",
              id: block.id,
              name: shortToolName(block.name),
              input: block.input,
            };
          }
        }
        return;
      }
      case "user": {
        if (message.parent_tool_use_id) return;
        const content = message.message.content;
        if (typeof content === "string") return;
        for (const block of content) {
          if (block.type === "tool_result") {
            yield {
              type: "tool-result",
              id: block.tool_use_id,
              output: block.content,
              isError: block.is_error ?? false,
            };
          }
        }
        return;
      }
      case "result": {
        const usage = message.usage;
        yield {
          type: "usage",
          inputTokens:
            usage.input_tokens +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0),
          outputTokens: usage.output_tokens,
          costUsd: message.total_cost_usd,
        };
        if (message.subtype !== "success") {
          const code: ProviderErrorCode =
            message.subtype === "error_max_budget_usd"
              ? "budget"
              : message.subtype === "error_max_turns"
                ? "max_turns"
                : "other";
          yield { type: "error", message: resultErrorText(message.subtype), code };
        } else if (message.is_error) {
          yield { type: "error", message: message.result || "The run failed", code: "other" };
        } else {
          this.authProblem = null;
        }
        return;
      }
      default:
        return;
    }
  }

  private baseOptions(extra: Options): Options {
    return {
      // Do not load the user's or project's Claude Code settings, hooks or CLAUDE.md files:
      // agents get exactly the prompt, tools and permissions the app configures.
      settingSources: [],
      persistSession: false,
      pathToClaudeCodeExecutable: this.opts.executablePath ?? undefined,
      stderr: (data) => log.debug("claude code stderr", { data: data.slice(0, 500) }),
      ...extra,
    };
  }
}

/** Claude Code's own OS sandbox for Bash (ADR 0015), with no way to run a command outside it. */
export function claudeSandbox(policy: SandboxPolicy): NonNullable<Options["sandbox"]> {
  return {
    enabled: true,
    failIfUnavailable: policy.required,
    // Every command still goes through canUseTool (grants); the sandbox is an extra layer.
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: false,
    network: { allowedDomains: policy.allowedDomains },
    filesystem: { denyRead: policy.denyRead },
  };
}

function toSdkTool(appTool: AgentTool) {
  return tool(appTool.name, appTool.description, appTool.inputSchema, async (args) => {
    const result = await appTool.handler(args as Record<string, unknown>);
    return {
      content: [{ type: "text" as const, text: result.text }],
      isError: result.isError ?? false,
    };
  });
}

function shortToolName(name: string): string {
  return name.startsWith(`mcp__${APP_MCP_SERVER}__`)
    ? name.slice(`mcp__${APP_MCP_SERVER}__`.length)
    : name;
}

function authHint(code: string): string {
  switch (code) {
    case "billing_error":
      return "Claude reported a billing problem with your account.";
    case "account_on_hold":
      return "Your Claude account is on hold.";
    default:
      return "Claude Code is not logged in. Run `claude` in a terminal and log in, then check again.";
  }
}

function resultErrorText(subtype: string): string {
  switch (subtype) {
    case "error_max_budget_usd":
      return "Stopped: the run reached its budget.";
    case "error_max_turns":
      return "Stopped: the run reached its maximum number of steps.";
    default:
      return "The run failed.";
  }
}

/** A streaming prompt that never sends a message, so Claude Code starts without calling the model. */
async function* idlePrompt(signal: AbortSignal): AsyncGenerator<SDKUserMessage> {
  await new Promise<void>((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms),
    ),
  ]);
}

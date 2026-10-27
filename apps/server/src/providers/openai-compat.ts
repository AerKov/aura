import { z } from "zod";
import { errorMessage, log } from "../lib/log";
import { decideToolUse } from "./confine";
import { type NativeTool, nativeTools } from "./native-tools";
import type {
  AgentEvent,
  AgentRunInput,
  LLMProvider,
  ProviderErrorCode,
  ProviderStatus,
} from "./types";

/**
 * Aura's own agent loop (ADR 0011) over an OpenAI-compatible chat completions API: OpenRouter,
 * Ollama, LM Studio, vLLM and others. The model streams text and tool calls; the loop runs the
 * tools in-process (built-in file/shell/web tools and the app's tools) until the model answers
 * without calling a tool, or a turn or budget limit stops it.
 */
export interface OpenAICompatOptions {
  id: string;
  /** Shown in messages; a function because the user can rename a custom server. */
  label: string | (() => string);
  /** Base URL that ends before `/chat/completions`, e.g. `https://openrouter.ai/api/v1`. */
  baseUrl: () => string;
  apiKey?: () => string | null;
  /** Cloud services refuse requests without a key; local servers do not need one. */
  needsKey?: boolean;
  headers?: Record<string, string>;
  /** Extra request fields for this service. */
  extraBody?: Record<string, unknown>;
  /** How spend is known: the service reports it (`usage.cost`), it is free (local), or unknown. */
  pricing: "usage-cost" | "free" | "unknown";
  defaultModel: () => string | null;
  /** Readiness check; defaults to listing models. */
  check?: () => Promise<ProviderStatus>;
  fetch?: typeof fetch;
}

type ToolCallOut = { id: string; type: "function"; function: { name: string; arguments: string } };
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCallOut[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** How the loop explains its tools; Claude Code brings its own version of this. */
const LOOP_PREAMBLE = `## How you work
You act through tools. Call a tool when you need to read, change or check something; never pretend you did.
File paths are relative to your workspace. After using tools, finish with a short message for the chat.`;

export class OpenAICompatProvider implements LLMProvider {
  readonly id: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly opts: OpenAICompatOptions) {
    this.id = opts.id;
    this.fetch = opts.fetch ?? fetch;
  }

  private get label(): string {
    return typeof this.opts.label === "function" ? this.opts.label() : this.opts.label;
  }

  async isAvailable(): Promise<ProviderStatus> {
    if (this.opts.needsKey && !this.opts.apiKey?.()) {
      return { ok: false, reason: `Add your ${this.label} API key in Engines.` };
    }
    if (this.opts.check) return this.opts.check();
    try {
      const res = await this.fetch(`${this.opts.baseUrl()}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, reason: `${this.label} answered HTTP ${res.status}.` };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: `${this.label} is not reachable at ${this.opts.baseUrl()} (${errorMessage(error)}).`,
      };
    }
  }

  headers(): Record<string, string> {
    const key = this.opts.apiKey?.();
    return {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...this.opts.headers,
    };
  }

  async *run(input: AgentRunInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const model = input.model ?? this.opts.defaultModel();
    if (!model) {
      yield {
        type: "error",
        message: `Choose a model for ${this.label} in Engines.`,
        code: "other",
      };
      return;
    }
    if (this.opts.needsKey && !this.opts.apiKey?.()) {
      yield {
        type: "error",
        message: `Add your ${this.label} API key in Engines.`,
        code: "auth",
      };
      return;
    }

    const cwd = input.cwd ?? process.cwd();
    const builtins = nativeTools(input.builtinTools, cwd);
    const appToolNames = input.tools.map((t) => t.name);
    const tools = new Map<string, NativeTool>();
    for (const tool of builtins) tools.set(tool.name, tool);
    for (const tool of input.tools) {
      tools.set(tool.name, {
        name: tool.name,
        description: tool.description,
        schema: z.object(tool.inputSchema),
        run: (args) => tool.handler(args),
      });
    }
    if (input.mcpServers && Object.keys(input.mcpServers).length > 0) {
      log.warn("mcp servers are not available in aura's own loop yet", { run: input.runId });
    }
    const toolSpecs = [...tools.values()].map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: jsonSchema(tool.schema),
      },
    }));

    const messages: ChatMessage[] = [
      { role: "system", content: `${input.systemPrompt}\n\n${LOOP_PREAMBLE}` },
      { role: "user", content: input.prompt },
    ];
    const totals = { input: 0, output: 0, cost: 0, costSeen: false };
    const usageEvent = (): AgentEvent => ({
      type: "usage",
      inputTokens: totals.input,
      outputTokens: totals.output,
      costUsd:
        this.opts.pricing === "free"
          ? 0
          : this.opts.pricing === "usage-cost" || totals.costSeen
            ? totals.cost
            : undefined,
    });
    let sawText = false;
    const maxTurns = input.maxTurns ?? 50;

    for (let turn = 0; ; turn++) {
      if (turn >= maxTurns) {
        yield usageEvent();
        yield {
          type: "error",
          message: "Stopped: the run reached its maximum number of steps.",
          code: "max_turns",
        };
        return;
      }
      let res: Response;
      try {
        res = await this.fetch(`${this.opts.baseUrl()}/chat/completions`, {
          method: "POST",
          headers: this.headers(),
          signal,
          body: JSON.stringify({
            model,
            messages,
            ...(toolSpecs.length > 0 ? { tools: toolSpecs } : {}),
            stream: true,
            stream_options: { include_usage: true },
            ...this.opts.extraBody,
          }),
        });
      } catch (error) {
        yield usageEvent();
        yield signal.aborted
          ? { type: "error", message: "Stopped", code: "aborted" }
          : {
              type: "error",
              message: `${this.label} is not reachable: ${errorMessage(error)}`,
              code: "other",
            };
        return;
      }
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        yield usageEvent();
        yield {
          type: "error",
          message: httpErrorText(this.label, res.status, detail),
          code: httpErrorCode(res.status),
        };
        return;
      }

      let text = "";
      const calls = new Map<number, { id: string; name: string; args: string }>();
      try {
        for await (const chunk of sseJson(res.body)) {
          const failure = streamError(chunk);
          if (failure) {
            yield usageEvent();
            yield { type: "error", message: `${this.label}: ${failure}`, code: "other" };
            return;
          }
          addUsage(totals, chunk);
          const delta = firstDelta(chunk);
          if (!delta) continue;
          if (typeof delta.content === "string" && delta.content) {
            if (!text && sawText) yield { type: "text-delta", text: "\n\n" };
            text += delta.content;
            sawText = true;
            yield { type: "text-delta", text: delta.content };
          }
          for (const part of toolCallParts(delta)) {
            const call = calls.get(part.index) ?? { id: "", name: "", args: "" };
            if (part.id) call.id = part.id;
            if (part.name) call.name += part.name;
            if (part.args) call.args += part.args;
            calls.set(part.index, call);
          }
        }
      } catch (error) {
        yield usageEvent();
        yield signal.aborted
          ? { type: "error", message: "Stopped", code: "aborted" }
          : {
              type: "error",
              message: `${this.label} stream failed: ${errorMessage(error)}`,
              code: "other",
            };
        return;
      }

      if (calls.size === 0) {
        yield usageEvent();
        yield { type: "done" };
        return;
      }

      const ordered = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([index, call]) => ({ ...call, id: call.id || `call_${turn}_${index}` }));
      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: ordered.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.args || "{}" },
        })),
      });
      for (const call of ordered) {
        const args = parseArgs(call.args);
        yield { type: "tool-call", id: call.id, name: call.name, input: args ?? call.args };
        const result = await this.runTool(input, cwd, tools, appToolNames, call.name, args, signal);
        if (signal.aborted) {
          yield usageEvent();
          yield { type: "error", message: "Stopped", code: "aborted" };
          return;
        }
        yield {
          type: "tool-result",
          id: call.id,
          output: result.text,
          isError: result.isError ?? false,
        };
        messages.push({ role: "tool", tool_call_id: call.id, content: result.text });
      }

      if (
        input.maxBudgetUsd !== undefined &&
        this.opts.pricing === "usage-cost" &&
        totals.cost >= input.maxBudgetUsd
      ) {
        yield usageEvent();
        yield { type: "error", message: "Stopped: the run reached its budget.", code: "budget" };
        return;
      }
    }
  }

  private async runTool(
    input: AgentRunInput,
    cwd: string,
    tools: Map<string, NativeTool>,
    appToolNames: string[],
    name: string,
    args: Record<string, unknown> | null,
    signal: AbortSignal,
  ): Promise<{ text: string; isError?: boolean }> {
    const tool = tools.get(name);
    if (!tool) return { text: `Unknown tool ${name}`, isError: true };
    if (!args) return { text: "The tool arguments were not valid JSON", isError: true };
    const decision = decideToolUse({
      tool: name,
      args,
      granted: input.builtinTools,
      appTools: appToolNames,
      cwd: input.confineToCwd ? cwd : undefined,
    });
    if (!decision.allow) {
      log.warn("tool use denied", { run: input.runId, tool: name, reason: decision.reason });
      return { text: decision.reason, isError: true };
    }
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      return { text: `Invalid arguments: ${z.prettifyError(parsed.error)}`, isError: true };
    }
    try {
      return await tool.run(parsed.data as Record<string, unknown>, signal);
    } catch (error) {
      log.warn("tool failed", { run: input.runId, tool: name, error: errorMessage(error) });
      return { text: errorMessage(error), isError: true };
    }
  }
}

function jsonSchema(schema: z.ZodObject): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** Parses a server-sent event stream of JSON chunks (`data: {...}`), ending at `[DONE]`. */
export async function* sseJson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue; // comments (": keep-alive"), event names, blanks
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data);
      } catch {
        log.debug("skipped a malformed stream line", { line: data.slice(0, 200) });
      }
    }
  }
}

function streamError(chunk: unknown): string | null {
  if (!isRecord(chunk) || !isRecord(chunk.error)) return null;
  return typeof chunk.error.message === "string"
    ? chunk.error.message
    : "the model returned an error";
}

function addUsage(
  totals: { input: number; output: number; cost: number; costSeen: boolean },
  chunk: unknown,
): void {
  if (!isRecord(chunk) || !isRecord(chunk.usage)) return;
  const u = chunk.usage;
  if (typeof u.prompt_tokens === "number") totals.input += u.prompt_tokens;
  if (typeof u.completion_tokens === "number") totals.output += u.completion_tokens;
  if (typeof u.cost === "number") {
    totals.cost += u.cost;
    totals.costSeen = true;
  }
}

function firstDelta(chunk: unknown): Record<string, unknown> | null {
  if (!isRecord(chunk) || !Array.isArray(chunk.choices)) return null;
  const choice: unknown = chunk.choices[0];
  if (!isRecord(choice)) return null;
  // Some servers send whole messages instead of deltas.
  if (isRecord(choice.delta)) return choice.delta;
  return isRecord(choice.message) ? choice.message : null;
}

function* toolCallParts(
  delta: Record<string, unknown>,
): Generator<{ index: number; id?: string; name?: string; args?: string }> {
  if (!Array.isArray(delta.tool_calls)) return;
  for (const [position, raw] of delta.tool_calls.entries()) {
    if (!isRecord(raw)) continue;
    const fn = isRecord(raw.function) ? raw.function : {};
    const args = fn.arguments;
    yield {
      index: typeof raw.index === "number" ? raw.index : position,
      id: typeof raw.id === "string" ? raw.id : undefined,
      name: typeof fn.name === "string" ? fn.name : undefined,
      // Some servers send arguments as an object instead of a JSON string.
      args: typeof args === "string" ? args : isRecord(args) ? JSON.stringify(args) : undefined,
    };
  }
}

function httpErrorCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 402) return "budget";
  return "other";
}

function httpErrorText(label: string, status: number, body: string): string {
  let detail = body.slice(0, 300);
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === "string") {
      detail = parsed.error.message;
    } else if (isRecord(parsed) && typeof parsed.error === "string") {
      detail = parsed.error;
    }
  } catch {
    // Not JSON: keep the raw text.
  }
  if (status === 401 || status === 403)
    return `${label} rejected the API key (HTTP ${status}). ${detail}`.trim();
  if (status === 429) return `${label} rate limit reached, try again later. ${detail}`.trim();
  if (status === 402) return `${label}: not enough credits. ${detail}`.trim();
  return `${label} answered HTTP ${status}. ${detail}`.trim();
}

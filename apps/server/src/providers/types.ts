/**
 * The only way feature code talks to a model (CLAUDE.md rule 5, docs/SPEC.md section 7).
 */

export type ProviderStatus = { ok: true; detail?: string } | { ok: false; reason: string };

import type { ZodRawShape } from "zod";

/** A custom tool exposed to the agent (implemented by the app, e.g. "create_project"). */
export interface AgentTool {
  name: string;
  description: string;
  /** Zod shape of the input. Handlers still validate values (models can send anything). */
  inputSchema: ZodRawShape;
  handler: (input: Record<string, unknown>) => Promise<{ text: string; isError?: boolean }>;
}

export interface AgentRunInput {
  /** Stable id of the run, for logs. */
  runId: string;
  systemPrompt: string;
  prompt: string;
  model?: string;
  /** Working directory. Coding tools are confined to it. */
  cwd?: string;
  /** Built-in tools the agent may use, e.g. ["Read", "Write", "Edit", "Bash"]. Empty means none. */
  builtinTools: string[];
  /** File tools may only touch paths inside `cwd` (sandbox level 0, docs/SPEC.md section 7). */
  confineToCwd?: boolean;
  /** App tools exposed to the agent. */
  tools: AgentTool[];
  maxTurns?: number;
  /** Hard stop for this run, in USD. */
  maxBudgetUsd?: number;
}

export type AgentEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; name: string; input: unknown }
  | { type: "tool-result"; id: string; output: unknown; isError?: boolean }
  | { type: "usage"; inputTokens: number; outputTokens: number; costUsd?: number }
  | { type: "done" }
  | { type: "error"; message: string; code?: ProviderErrorCode };

export type ProviderErrorCode =
  | "auth"
  | "rate_limit"
  | "budget"
  | "max_turns"
  | "aborted"
  | "other";

export interface LLMProvider {
  id: string;
  isAvailable(): Promise<ProviderStatus>;
  run(input: AgentRunInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
}

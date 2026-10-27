/**
 * Agent engines (ADR 0011, 0012): what actually runs an agent. `claude-code` is the official Claude
 * Agent SDK; `gemini-cli`, `codex` and `opencode` are other agents' own CLIs driven over the Agent
 * Client Protocol, each under the user's own login; the rest run Aura's own agent loop against an
 * OpenAI-compatible chat API (a cloud router, or a local model server).
 */
export const ENGINE_IDS = [
  "claude-code",
  "gemini-cli",
  "codex",
  "opencode",
  "openrouter",
  "ollama",
  "openai-compatible",
] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === "string" && (ENGINE_IDS as readonly string[]).includes(value);
}

/** Model ids across engines: `claude-sonnet-5-5`, `qwen3:8b`, `vendor/model:free`. */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/@-]{2,120}$/;

export interface EngineModel {
  id: string;
  label: string;
  /** Costs nothing to run (local, or a free model on a router). */
  free: boolean;
}

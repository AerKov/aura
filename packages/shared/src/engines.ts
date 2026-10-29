/**
 * Agent engines (ADR 0011, 0012): what actually runs an agent. `claude-code` is the official Claude
 * Agent SDK; `gemini-cli`, `codex` and `opencode` are other agents' own CLIs driven over the Agent
 * Client Protocol, each under the user's own login; the rest run Aura's own agent loop against an
 * OpenAI-compatible chat API: a free cloud service (ADR 0037), a router, or a local model server.
 */
export const ENGINE_IDS = [
  "google",
  "groq",
  "openrouter",
  "cerebras",
  "mistral",
  "ollama",
  "openai-compatible",
  "claude-code",
  "gemini-cli",
  "codex",
  "opencode",
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

/**
 * Free cloud services with an OpenAI-compatible API (ADR 0037): the easiest way to start. The user
 * makes a key on the service's site, pastes it, and Aura's own agent loop runs on it. Limits and
 * terms change often, so the catalog names none; each service's page is the truth.
 */
export interface FreeService {
  id: EngineId;
  label: string;
  /** What it is, in a line. */
  blurb: string;
  baseUrl: string;
  /** Where the user makes a key. */
  keyUrl: string;
  /** What the free plan means for privacy and limits, shown on the card. */
  note: string;
  /** Model ids to try first when the user has not chosen one, best first. */
  preferred: string[];
  /** A prefix the service puts on model ids that the chat endpoint does not want. */
  stripPrefix?: string;
}

export const FREE_SERVICES: FreeService[] = [
  {
    id: "google",
    label: "Google Gemini",
    blurb: "Gemini models from Google AI Studio. A free key, no card needed.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "On the free plan Google may use your prompts to improve its products, and daily limits apply.",
    preferred: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview"],
    stripPrefix: "models/",
  },
  {
    id: "groq",
    label: "Groq",
    blurb: "Open models (gpt-oss, Llama) answering very fast. A free key.",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    note: "The free plan has per-minute and daily limits; long agent runs may need to wait.",
    preferred: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    blurb: "Many models behind one key, with a free section (models ending in :free).",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    note: "Free models have daily limits and may log prompts; pick one marked free.",
    preferred: [],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    blurb:
      "Open models on very fast hardware. A key is free to make; the free plan's terms change.",
    baseUrl: "https://api.cerebras.ai/v1",
    keyUrl: "https://cloud.cerebras.ai/",
    note: "Check the plan on the sign-up page: a card may be asked for. Daily limits apply.",
    preferred: ["gpt-oss-120b", "llama-3.3-70b", "qwen-3-32b"],
  },
  {
    id: "mistral",
    label: "Mistral",
    blurb: "Mistral's own models, with a free Experiment plan.",
    baseUrl: "https://api.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/api-keys",
    note: "The free plan may ask for a phone number and may use your prompts to train models.",
    preferred: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
  },
];

export const FREE_SERVICE_IDS: readonly EngineId[] = FREE_SERVICES.map((s) => s.id);

export function freeServiceOf(id: EngineId): FreeService | undefined {
  return FREE_SERVICES.find((s) => s.id === id);
}

/** The model to start with: the first preferred one the service offers, else its first model. */
export function pickStartModel(service: FreeService, offered: string[]): string | null {
  return service.preferred.find((id) => offered.includes(id)) ?? offered[0] ?? null;
}

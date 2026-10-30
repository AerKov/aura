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
  "llama-cpp",
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

/**
 * Local models for the built-in llama.cpp engine (ADR 0038). The catalog names a Hugging Face
 * repository and a quantization, not a file: the exact file, its size and its checksum are read
 * from Hugging Face when the user asks to install, so a renamed file never breaks the list.
 */
export interface LocalModel {
  id: string;
  label: string;
  /** Hugging Face repository with GGUF files. */
  repo: string;
  /** Part of the GGUF file name to choose, e.g. "Q4_K_M". */
  quant: string;
  /** Rough download size in GB, for the list before the real size is read. */
  sizeGb: number;
  /** Memory the model wants (RAM, or video memory on a GPU) with a 16K context, in GB. */
  ramGb: number;
  note: string;
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: "qwen3-4b",
    label: "Qwen3 4B",
    repo: "unsloth/Qwen3-4B-GGUF",
    quant: "Q4_K_M",
    sizeGb: 2.5,
    ramGb: 6,
    note: "A good first model: small, follows tools reasonably, answers in many languages.",
  },
  {
    id: "qwen3-8b",
    label: "Qwen3 8B",
    repo: "unsloth/Qwen3-8B-GGUF",
    quant: "Q4_K_M",
    sizeGb: 5,
    ramGb: 10,
    note: "Noticeably better at tools and code; wants a machine with 16 GB.",
  },
  {
    id: "gpt-oss-20b",
    label: "gpt-oss 20B",
    repo: "ggml-org/gpt-oss-20b-GGUF",
    quant: "mxfp4",
    sizeGb: 12,
    ramGb: 16,
    note: "The strongest here for agents, but large: for 24 GB or a good GPU.",
  },
  {
    id: "llama-3.2-3b",
    label: "Llama 3.2 3B",
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    quant: "Q4_K_M",
    sizeGb: 2,
    ramGb: 5,
    note: "Small and quick; fine for chat, weaker with tools.",
  },
  {
    id: "lfm2-1.2b",
    label: "Liquid LFM2 1.2B",
    repo: "LiquidAI/LFM2-1.2B-GGUF",
    quant: "Q4_K_M",
    sizeGb: 0.8,
    ramGb: 3,
    note: "Tiny, for weak computers; simple jobs only.",
  },
];

/** The largest catalog model that fits the memory, or the smallest one when none does. */
export function recommendedModel(ramGb: number): LocalModel {
  const fits = LOCAL_MODELS.filter((m) => m.ramGb <= ramGb);
  const best = fits.sort((a, b) => b.ramGb - a.ramGb)[0];
  // gpt-oss is the strongest but heavy: Qwen3 is the default pick until memory is plentiful.
  const pick =
    best?.id === "gpt-oss-20b" && ramGb < 24 ? fits.find((m) => m.id === "qwen3-8b") : best;
  return (
    pick ??
    [...LOCAL_MODELS].sort((a, b) => a.ramGb - b.ramGb)[0] ??
    (LOCAL_MODELS[0] as LocalModel)
  );
}

/** `owner/name` or `owner/name:Q4_K_M`: a Hugging Face repository chosen by the user. */
export function parseRepoSpec(raw: string): { repo: string; quant: string } | null {
  const m =
    /^([A-Za-z0-9][A-Za-z0-9._-]{0,60}\/[A-Za-z0-9][A-Za-z0-9._-]{0,100})(?::([A-Za-z0-9_.-]{1,30}))?$/.exec(
      raw.trim(),
    );
  return m ? { repo: m[1] as string, quant: m[2] ?? "Q4_K_M" } : null;
}

/** What the user is asked to approve before anything is downloaded. */
export interface LocalPlan {
  /** The llama.cpp release to install, or null when it is already there. */
  binary: { tag: string; asset: string; url: string; size: number; sha256: string } | null;
  model: { repo: string; file: string; url: string; size: number; sha256: string | null } | null;
  /** Free space on the disk where the files go, bytes; null when unknown. */
  freeBytes: number | null;
}

export type LocalAiPhase = "idle" | "binary" | "model" | "starting" | "done" | "error";

export interface LocalAiStatus {
  /** The installed llama.cpp release tag, or null. */
  installed: string | null;
  /** The variant installed ("cpu", "vulkan", "metal"…). */
  variant: string | null;
  /** Memory of this computer, GB, for the recommendation. */
  ramGb: number;
  recommended: string;
  /** GGUF files that are downloaded. */
  models: { file: string; size: number }[];
  /** The model the server runs, or null while it is stopped. */
  running: string | null;
  job: { phase: LocalAiPhase; label: string; done: number; total: number; error: string | null };
}

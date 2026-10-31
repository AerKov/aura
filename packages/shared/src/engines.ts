/**
 * Agent engines (ADR 0011, 0042): what actually runs an agent. `claude-code` is the official Claude
 * Agent SDK under the user's own login; the rest run Aura's own agent loop against an
 * OpenAI-compatible chat API: the built-in local AI (ADR 0038), a local model server, or any
 * compatible API the user adds.
 */
export const ENGINE_IDS = ["llama-cpp", "ollama", "openai-compatible", "claude-code"] as const;
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

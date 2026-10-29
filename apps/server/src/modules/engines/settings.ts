import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type EngineId, isEngineId, MODEL_ID_PATTERN } from "@aura/shared";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";

/** Engine configuration, `<dataDir>/engines.json` (config in files, versioned; no secrets). */
export interface EngineSettings {
  /** Engine for agents whose profile does not name one. */
  default: EngineId;
  /** Default model per engine (for Claude Code, null falls back to AURA_DEFAULT_MODEL). */
  models: Partial<Record<EngineId, string>>;
  ollama: { baseUrl: string };
  custom: { baseUrl: string; label: string };
  /** Semantic memory search (ADR 0013): an embedding model on a local or compatible server. */
  memory: { engine: EmbeddingEngine | null; model: string | null };
  /** Fold older chat messages into a rolling summary for agents (ADR 0017). */
  summaries: boolean;
}

export const EMBEDDING_ENGINES = ["ollama", "openai-compatible"] as const;
export type EmbeddingEngine = (typeof EMBEDDING_ENGINES)[number];

function isEmbeddingEngine(value: unknown): value is EmbeddingEngine {
  return typeof value === "string" && (EMBEDDING_ENGINES as readonly string[]).includes(value);
}

/** Engines that use an API key. Keys live in `state/secrets.json`, outside git (ADR 0011). */
export const KEYED_ENGINES = [
  "google",
  "groq",
  "openrouter",
  "cerebras",
  "mistral",
  "openai-compatible",
] as const;
export type KeyedEngine = (typeof KEYED_ENGINES)[number];

export const DEFAULT_SETTINGS: EngineSettings = {
  default: "claude-code",
  models: {},
  ollama: { baseUrl: "http://127.0.0.1:11434" },
  custom: { baseUrl: "http://127.0.0.1:1234/v1", label: "LM Studio" },
  memory: { engine: null, model: null },
  summaries: true,
};

export class EngineSettingsError extends Error {
  override name = "EngineSettingsError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validBaseUrl(raw: unknown): string {
  if (typeof raw !== "string") throw new EngineSettingsError("The URL must be a string");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new EngineSettingsError(`"${raw}" is not a URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new EngineSettingsError("Only http(s) URLs are supported");
  if (url.username || url.password)
    throw new EngineSettingsError("Put credentials in the API key field, not in the URL");
  return url.href.replace(/\/+$/, "");
}

/** Reads untrusted settings (a hand-edited file): bad fields fall back to defaults. */
export function parseSettings(raw: unknown): EngineSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  if (!isRecord(raw)) return settings;
  if (isEngineId(raw.default)) settings.default = raw.default;
  if (isRecord(raw.models)) {
    for (const [engine, model] of Object.entries(raw.models)) {
      if (isEngineId(engine) && typeof model === "string" && MODEL_ID_PATTERN.test(model))
        settings.models[engine] = model;
    }
  }
  try {
    if (isRecord(raw.ollama)) settings.ollama.baseUrl = validBaseUrl(raw.ollama.baseUrl);
  } catch (error) {
    log.warn("engines.json: invalid ollama url", { error: errorMessage(error) });
  }
  if (isRecord(raw.custom)) {
    try {
      settings.custom.baseUrl = validBaseUrl(raw.custom.baseUrl);
    } catch (error) {
      log.warn("engines.json: invalid custom url", { error: errorMessage(error) });
    }
    if (typeof raw.custom.label === "string" && raw.custom.label.trim())
      settings.custom.label = raw.custom.label.trim().slice(0, 40);
  }
  if (
    isRecord(raw.memory) &&
    isEmbeddingEngine(raw.memory.engine) &&
    typeof raw.memory.model === "string" &&
    MODEL_ID_PATTERN.test(raw.memory.model)
  ) {
    settings.memory = { engine: raw.memory.engine, model: raw.memory.model };
  }
  if (typeof raw.summaries === "boolean") settings.summaries = raw.summaries;
  return settings;
}

export interface SettingsPatch {
  default?: EngineId;
  /** A model per engine; null clears it. */
  models?: Partial<Record<EngineId, string | null>>;
  ollamaBaseUrl?: string;
  customBaseUrl?: string;
  customLabel?: string;
  /** Semantic memory search: both set to turn it on, both null to turn it off. */
  memoryEngine?: EmbeddingEngine | null;
  memoryModel?: string | null;
  summaries?: boolean;
}

/** Engine settings and API keys on disk. */
export class EngineStore {
  private cached: EngineSettings | null = null;
  private secrets: Partial<Record<KeyedEngine, string>> | null = null;

  constructor(private readonly dataDir: string) {}

  private get file(): string {
    return join(this.dataDir, "engines.json");
  }

  private get secretsFile(): string {
    return join(this.dataDir, "state", "secrets.json");
  }

  /** Drops the cached settings, so the file is read again (a restore point put it back). */
  reload(): void {
    this.cached = null;
  }

  get(): EngineSettings {
    if (this.cached) return this.cached;
    let raw: unknown = null;
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, "utf8"));
      } catch (error) {
        log.warn("engines.json is not valid JSON; using defaults", { error: errorMessage(error) });
      }
    }
    this.cached = parseSettings(raw);
    return this.cached;
  }

  async update(patch: SettingsPatch): Promise<EngineSettings> {
    const next = structuredClone(this.get());
    if (patch.default !== undefined) next.default = patch.default;
    for (const [engine, model] of Object.entries(patch.models ?? {})) {
      if (!isEngineId(engine)) continue;
      if (model === null || model === "") delete next.models[engine];
      else if (typeof model === "string" && MODEL_ID_PATTERN.test(model))
        next.models[engine] = model;
      else throw new EngineSettingsError(`"${model}" is not a valid model id`);
    }
    if (patch.ollamaBaseUrl !== undefined) next.ollama.baseUrl = validBaseUrl(patch.ollamaBaseUrl);
    if (patch.customBaseUrl !== undefined) next.custom.baseUrl = validBaseUrl(patch.customBaseUrl);
    if (patch.customLabel?.trim()) next.custom.label = patch.customLabel.trim().slice(0, 40);
    if (patch.memoryEngine !== undefined || patch.memoryModel !== undefined) {
      const engine = patch.memoryEngine === undefined ? next.memory.engine : patch.memoryEngine;
      const model =
        (patch.memoryModel === undefined ? next.memory.model : patch.memoryModel) || null;
      if (engine && model && !MODEL_ID_PATTERN.test(model))
        throw new EngineSettingsError(`"${model}" is not a valid model id`);
      next.memory = engine && model ? { engine, model } : { engine: null, model: null };
    }
    if (patch.summaries !== undefined) next.summaries = patch.summaries;
    writeFileSync(this.file, `${JSON.stringify(next, null, 2)}\n`);
    this.cached = next;
    await commitAll(this.dataDir, "chore(engines): update engine settings");
    return next;
  }

  key(engine: KeyedEngine): string | null {
    if (!this.secrets) {
      this.secrets = {};
      if (existsSync(this.secretsFile)) {
        try {
          const raw: unknown = JSON.parse(readFileSync(this.secretsFile, "utf8"));
          if (isRecord(raw)) {
            for (const name of KEYED_ENGINES) {
              const value = raw[name];
              if (typeof value === "string" && value) this.secrets[name] = value;
            }
          }
        } catch (error) {
          log.warn("state/secrets.json is unreadable", { error: errorMessage(error) });
        }
      }
    }
    return this.secrets[engine] ?? null;
  }

  /** Stores a key readable only by the user (0600). It never leaves the server. */
  setKey(engine: KeyedEngine, key: string | null): void {
    this.key(engine);
    const secrets = { ...this.secrets };
    if (key) secrets[engine] = key.trim();
    else delete secrets[engine];
    mkdirSync(join(this.dataDir, "state"), { recursive: true });
    writeFileSync(this.secretsFile, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
    chmodSync(this.secretsFile, 0o600);
    this.secrets = secrets;
    log.info("engine key updated", { engine, set: Boolean(key) });
  }
}

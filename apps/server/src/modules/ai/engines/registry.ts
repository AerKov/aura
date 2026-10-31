import { ENGINE_IDS, type EngineId, type EngineModel } from "@aura/shared";
import { errorMessage, log } from "../../../lib/log";
import { type Embedder, OpenAICompatEmbedder } from "../../../providers/embeddings";
import { OpenAICompatProvider } from "../../../providers/openai-compat";
import type { LLMProvider, ProviderStatus } from "../../../providers/types";
import { LocalAiService, type SpawnServer } from "../localai/service";
import { EngineStore, KEYED_ENGINES, type KeyedEngine } from "./settings";

/** What the runtime needs: the engine and model for an agent. */
/** How long an engine's status is kept before it is checked again. */
const STATUS_TTL_MS = 15_000;

export interface EngineSelector {
  pick(profile: { engine: EngineId | null; model: string | null }): {
    engine: EngineId;
    provider: LLMProvider;
    model: string | null;
  };
}

export interface EngineInfo {
  id: EngineId;
  label: string;
  /**
   * "official": Claude Code through its SDK; "aura": Aura's own agent loop.
   */
  kind: "official" | "aura";
  description: string;
  /** There is a way to use it without paying (local models, free router models). */
  free: boolean;
  isDefault: boolean;
  status: ProviderStatus;
  model: string | null;
  needsKey: boolean;
  hasKey: boolean;
  baseUrl: string | null;
}

const DESCRIPTIONS: Record<
  EngineId,
  { label: string; kind: EngineInfo["kind"]; free: boolean; text: string }
> = {
  "llama-cpp": {
    label: "Built-in local AI",
    kind: "aura",
    free: true,
    text: "Aura installs llama.cpp for you and runs a model on this computer: free and private. Choose a model that fits your memory.",
  },
  "claude-code": {
    label: "Claude Code",
    kind: "official",
    free: false,
    text: "Anthropic's agent under your own Claude login (subscription or API). The strongest coder.",
  },
  ollama: {
    label: "Ollama",
    kind: "aura",
    free: true,
    text: "Local open models on your machine: free and private. Use a model with tool calling (e.g. qwen3) and a long context: start Ollama with `OLLAMA_CONTEXT_LENGTH=32768`.",
  },
  "openai-compatible": {
    label: "OpenAI-compatible",
    kind: "aura",
    free: true,
    text: "Any OpenAI-compatible server: LM Studio, llama.cpp, vLLM, or a cloud API.",
  },
};

/** How an engine runs agents: Claude Code, or Aura's own loop. */
export const engineKind = (engine: EngineId): EngineInfo["kind"] => DESCRIPTIONS[engine].kind;
export const engineLabel = (engine: EngineId): string => DESCRIPTIONS[engine].label;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The agent engines (ADR 0011): Claude Code plus Aura's own loop on the built-in local AI, Ollama or any
 * OpenAI-compatible server. Picks the engine and model for each agent run.
 */
export class EngineRegistry implements EngineSelector {
  readonly store: EngineStore;
  private readonly statuses = new Map<EngineId, { at: number; value: Promise<ProviderStatus> }>();
  readonly localAi: LocalAiService;
  private readonly providers: Record<EngineId, LLMProvider>;
  private readonly fetch: typeof fetch;

  constructor(
    private readonly opts: {
      dataDir: string;
      claude: LLMProvider & { resetStatus?: () => void };
      /** Claude model when neither the agent nor the settings name one (AURA_DEFAULT_MODEL). */
      defaultModel?: string;
      fetch?: typeof fetch;
      appVersion?: string;
      /** Replaces the llama.cpp server process in tests. */
      llamaSpawn?: SpawnServer;
      llamaSystem?: { platform: string; arch: string; ramBytes: number };
    },
  ) {
    this.store = new EngineStore(opts.dataDir);
    this.store.onChange = () => this.forgetStatuses();
    this.fetch = opts.fetch ?? fetch;
    this.localAi = new LocalAiService({
      dataDir: opts.dataDir,
      fetch: this.fetch,
      spawn: opts.llamaSpawn,
      ...opts.llamaSystem,
      onInstalled: async (file) => {
        if (file) await this.useLocalModel(file);
      },
      onChange: () => this.forgetStatuses(),
    });
    const settings = () => this.store.get();
    this.providers = {
      "claude-code": opts.claude,
      "llama-cpp": new OpenAICompatProvider({
        id: "llama-cpp",
        label: "Built-in local AI",
        baseUrl: () => this.localAi.endpoint()?.baseUrl ?? "http://127.0.0.1:0/v1",
        apiKey: () => this.localAi.endpoint()?.key ?? null,
        pricing: "free",
        defaultModel: () => settings().models["llama-cpp"] ?? null,
        check: () => this.checkLocal(),
        prepare: (model) => this.localAi.ensureRunning(model),
        fetch: this.fetch,
      }),
      ollama: new OpenAICompatProvider({
        id: "ollama",
        label: "Ollama",
        baseUrl: () => `${settings().ollama.baseUrl}/v1`,
        pricing: "free",
        defaultModel: () => settings().models.ollama ?? null,
        check: () => this.checkOllama(),
        fetch: this.fetch,
      }),
      "openai-compatible": new OpenAICompatProvider({
        id: "openai-compatible",
        label: () => settings().custom.label,
        baseUrl: () => settings().custom.baseUrl,
        apiKey: () => this.store.key("openai-compatible"),
        pricing: "unknown",
        defaultModel: () => settings().models["openai-compatible"] ?? null,
        fetch: this.fetch,
      }),
    };
  }

  /** The embedding model for semantic memory search, or null when it is off (ADR 0013). */
  embedder(): Embedder | null {
    const settings = this.store.get();
    const { engine, model } = settings.memory;
    if (!engine || !model) return null;
    const baseUrl = engine === "ollama" ? `${settings.ollama.baseUrl}/v1` : settings.custom.baseUrl;
    const apiKey = engine === "openai-compatible" ? this.store.key("openai-compatible") : null;
    const key = `${engine}|${model}|${baseUrl}|${apiKey ?? ""}`;
    if (this.embedderCache?.key !== key) {
      this.embedderCache = {
        key,
        embedder: new OpenAICompatEmbedder({ engine, baseUrl, model, apiKey, fetch: this.fetch }),
      };
    }
    return this.embedderCache.embedder;
  }

  private embedderCache: { key: string; embedder: Embedder } | null = null;

  provider(engine: EngineId): LLMProvider {
    return this.providers[engine];
  }

  pick(profile: { engine: EngineId | null; model: string | null }) {
    const settings = this.store.get();
    const engine = profile.engine ?? settings.default;
    // A model in a profile belongs to the profile's engine. Older profiles name no engine and
    // carry Claude models, so they only apply when the default engine is Claude Code.
    const own = profile.engine !== null || engine === "claude-code" ? profile.model : null;
    const model =
      own ??
      settings.models[engine] ??
      (engine === "claude-code" ? (this.opts.defaultModel ?? null) : null);
    return { engine, provider: this.providers[engine], model };
  }

  /**
   * Whether an engine works now. Checks (a program on disk, a server, a key) can take seconds, so
   * an answer is kept for a short while (ADR 0039); any change to engines forgets it, and `fresh`
   * asks again.
   */
  status(id: EngineId, fresh = false): Promise<ProviderStatus> {
    const kept = this.statuses.get(id);
    if (!fresh && kept && Date.now() - kept.at < STATUS_TTL_MS) return kept.value;
    const value = withTimeout(this.providers[id].isAvailable(), 25_000).catch(
      (error: unknown): ProviderStatus => ({ ok: false, reason: errorMessage(error) }),
    );
    this.statuses.set(id, { at: Date.now(), value });
    return value;
  }

  forgetStatuses(): void {
    this.statuses.clear();
  }

  defaultStatus(): Promise<ProviderStatus> {
    return this.status(this.store.get().default);
  }

  resetStatus(): void {
    this.opts.claude.resetStatus?.();
    this.forgetStatuses();
  }

  async list(fresh = false): Promise<{
    default: EngineId;
    engines: EngineInfo[];
    memory: ReturnType<EngineStore["get"]>["memory"];
    summaries: boolean;
  }> {
    const settings = this.store.get();
    const engines = await Promise.all(
      ENGINE_IDS.map(async (id): Promise<EngineInfo> => {
        const d = DESCRIPTIONS[id];
        const status = await this.status(id, fresh);
        const keyed = (KEYED_ENGINES as readonly string[]).includes(id);
        return {
          id,
          label: id === "openai-compatible" ? settings.custom.label : d.label,
          kind: d.kind,
          description: d.text,
          free: d.free,
          isDefault: settings.default === id,
          status,
          model:
            settings.models[id] ?? (id === "claude-code" ? (this.opts.defaultModel ?? null) : null),
          needsKey: (KEYED_ENGINES as readonly string[]).includes(id) && id !== "openai-compatible",
          hasKey: keyed ? this.store.key(id as KeyedEngine) !== null : false,
          baseUrl:
            id === "ollama"
              ? settings.ollama.baseUrl
              : id === "openai-compatible"
                ? settings.custom.baseUrl
                : null,
        };
      }),
    );
    return {
      default: settings.default,
      engines,
      memory: settings.memory,
      summaries: settings.summaries,
    };
  }

  /** Models an engine offers, free ones first. Claude Code has no listing API. */
  async models(engine: EngineId): Promise<EngineModel[]> {
    const settings = this.store.get();
    if (engine === "claude-code") {
      return ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"].map(
        (id) => ({ id, label: id, free: false }),
      );
    }
    if (engine === "ollama") {
      const body = await this.getJson(`${settings.ollama.baseUrl}/api/tags`);
      const models = isRecord(body) && Array.isArray(body.models) ? body.models : [];
      return models
        .filter(isRecord)
        .map((m) => String(m.name ?? m.model ?? ""))
        .filter(Boolean)
        .map((id) => ({ id, label: id, free: true }));
    }
    if (engine === "llama-cpp")
      return this.localAi.models().map((m) => ({ id: m.file, label: m.file, free: true }));
    const key = this.store.key("openai-compatible");
    const body = await this.getJson(
      `${settings.custom.baseUrl}/models`,
      key ? { authorization: `Bearer ${key}` } : {},
    );
    const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];
    return data
      .filter(isRecord)
      .map((m) => String(m.id ?? ""))
      .filter(Boolean)
      .map((id) => ({ id, label: id, free: false }));
  }

  private async checkLocal(): Promise<ProviderStatus> {
    const status = this.localAi.status();
    if (!status.installed)
      return {
        ok: false,
        reason: "Install the built-in local AI: Aura downloads llama.cpp for you.",
      };
    const model = this.store.get().models["llama-cpp"];
    if (!model || !status.models.some((m) => m.file === model))
      return { ok: false, reason: "Choose a local model to download." };
    return {
      ok: true,
      detail: status.running ? `${model} (running)` : `${model} (starts when needed)`,
    };
  }

  /**
   * Makes a downloaded model the one the built-in local AI runs and, when nothing else works yet,
   * the default engine (ADR 0038).
   */
  async useLocalModel(file: string): Promise<void> {
    const settings = this.store.get();
    const currentWorks =
      settings.default !== "llama-cpp" && (await this.status(settings.default).then((s) => s.ok));
    await this.store.update({
      models: { "llama-cpp": file },
      ...(currentWorks ? {} : { default: "llama-cpp" }),
    });
  }

  private async getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const res = await this.fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
    return res.json();
  }

  private async checkOllama(): Promise<ProviderStatus> {
    const base = this.store.get().ollama.baseUrl;
    try {
      const models = await this.models("ollama");
      if (models.length === 0) {
        return {
          ok: false,
          reason:
            "Ollama is running but has no models. Run `ollama pull qwen3:8b` (it can use tools).",
        };
      }
      return { ok: true, detail: `${models.length} local model${models.length > 1 ? "s" : ""}` };
    } catch (error) {
      log.debug("ollama check failed", { error: errorMessage(error) });
      return {
        ok: false,
        reason: `Ollama is not running at ${base}. Install it from ollama.com and start it.`,
      };
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms),
    ),
  ]);
}

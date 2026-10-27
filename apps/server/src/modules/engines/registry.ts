import { ENGINE_IDS, type EngineId, type EngineModel } from "@aura/shared";
import { errorMessage, log } from "../../lib/log";
import { type AcpAgentSpec, AcpProvider, type AgentProcess } from "../../providers/acp";
import { locateExecutable } from "../../providers/claude-locate";
import { type Embedder, OpenAICompatEmbedder } from "../../providers/embeddings";
import { OpenAICompatProvider } from "../../providers/openai-compat";
import type { LLMProvider, ProviderStatus } from "../../providers/types";
import { EngineStore, KEYED_ENGINES, type KeyedEngine } from "./settings";
import type { ToolBridgeLike } from "./tool-bridge";

const OPENROUTER_URL = "https://openrouter.ai/api/v1";

/** What the runtime needs: the engine and model for an agent. */
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
   * "official": Claude Code through its SDK; "acp": another vendor's agent CLI over the Agent
   * Client Protocol (its own login); "aura": Aura's own agent loop.
   */
  kind: "official" | "acp" | "aura";
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
  "claude-code": {
    label: "Claude Code",
    kind: "official",
    free: false,
    text: "Anthropic's agent under your own Claude login (subscription or API). The strongest coder.",
  },
  "gemini-cli": {
    label: "Gemini CLI",
    kind: "acp",
    free: true,
    text: "Google's open-source agent under your Google login. Its free tier is generous for personal use.",
  },
  codex: {
    label: "Codex",
    kind: "acp",
    free: false,
    text: "OpenAI's coding agent under your ChatGPT plan or OpenAI API key, through the codex-acp adapter.",
  },
  opencode: {
    label: "OpenCode",
    kind: "acp",
    free: true,
    text: "Open-source coding agent that brings its own providers, local models included.",
  },
  openrouter: {
    label: "OpenRouter",
    kind: "aura",
    free: true,
    text: "Hundreds of cloud models with one API key, including free ones (rate limited). Runs on Aura's own agent loop.",
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

/** Agent CLIs that speak ACP (ADR 0012). Each uses its own login; Aura never sees it. */
export const ACP_AGENTS: Record<"gemini-cli" | "codex" | "opencode", AcpAgentSpec> = {
  "gemini-cli": {
    id: "gemini-cli",
    label: "Gemini CLI",
    command: () => {
      const exe = locateExecutable("gemini");
      return exe ? { command: exe, args: ["--acp"] } : null;
    },
    modelArgs: (model) => ["--model", model],
    installHint: "Install it with `npm install -g @google/gemini-cli`.",
    loginHint: "Run `gemini` in a terminal once and sign in with Google, then check again.",
  },
  codex: {
    id: "codex",
    label: "Codex",
    command: () => {
      const exe = locateExecutable("codex-acp");
      return exe ? { command: exe, args: [] } : null;
    },
    installHint:
      "Install Codex (`npm install -g @openai/codex`) and its ACP adapter (`npm install -g @zed-industries/codex-acp`).",
    loginHint: "Run `codex login` in a terminal, then check again.",
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    command: () => {
      const exe = locateExecutable("opencode");
      return exe ? { command: exe, args: ["acp"] } : null;
    },
    installHint: "Install it with `npm install -g opencode-ai`.",
    loginHint: "Run `opencode auth login` in a terminal to connect a provider, then check again.",
  },
};

const ACP_MODELS: Partial<Record<EngineId, string[]>> = {
  "gemini-cli": [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
  ],
};

const descriptionOf = (engine: EngineId) => DESCRIPTIONS[engine];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The agent engines (ADR 0011): Claude Code plus Aura's own loop on OpenRouter, Ollama or any
 * OpenAI-compatible server. Picks the engine and model for each agent run.
 */
export class EngineRegistry implements EngineSelector {
  readonly store: EngineStore;
  private readonly providers: Record<EngineId, LLMProvider>;
  private readonly fetch: typeof fetch;

  constructor(
    private readonly opts: {
      dataDir: string;
      claude: LLMProvider & { resetStatus?: () => void };
      /** Claude model when neither the agent nor the settings name one (AURA_DEFAULT_MODEL). */
      defaultModel?: string;
      fetch?: typeof fetch;
      /** Serves app tools to ACP agents over MCP. */
      toolBridge?: ToolBridgeLike;
      appVersion?: string;
      /** Replaces agent CLIs in tests. */
      acpSpawn?: (cmd: string[], cwd: string, env: Record<string, string>) => AgentProcess;
      acpAgents?: Partial<Record<keyof typeof ACP_AGENTS, AcpAgentSpec>>;
    },
  ) {
    this.store = new EngineStore(opts.dataDir);
    this.fetch = opts.fetch ?? fetch;
    const settings = () => this.store.get();
    const acp = (id: keyof typeof ACP_AGENTS) =>
      new AcpProvider(opts.acpAgents?.[id] ?? ACP_AGENTS[id], {
        appVersion: opts.appVersion ?? "0.0.0",
        toolBridge: opts.toolBridge,
        spawn: opts.acpSpawn,
      });
    this.providers = {
      "claude-code": opts.claude,
      "gemini-cli": acp("gemini-cli"),
      codex: acp("codex"),
      opencode: acp("opencode"),
      openrouter: new OpenAICompatProvider({
        id: "openrouter",
        label: "OpenRouter",
        baseUrl: () => OPENROUTER_URL,
        apiKey: () => this.store.key("openrouter"),
        needsKey: true,
        headers: { "HTTP-Referer": "https://github.com/aerkov/aura", "X-Title": "Aura" },
        pricing: "usage-cost",
        defaultModel: () => settings().models.openrouter ?? null,
        check: () => this.checkOpenRouter(),
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

  defaultStatus(): Promise<ProviderStatus> {
    return this.providers[this.store.get().default].isAvailable();
  }

  resetStatus(): void {
    this.opts.claude.resetStatus?.();
  }

  async list(): Promise<{
    default: EngineId;
    engines: EngineInfo[];
    memory: ReturnType<EngineStore["get"]>["memory"];
    summaries: boolean;
  }> {
    const settings = this.store.get();
    const engines = await Promise.all(
      ENGINE_IDS.map(async (id): Promise<EngineInfo> => {
        const d = DESCRIPTIONS[id];
        const status = await withTimeout(this.providers[id].isAvailable(), 25_000).catch(
          (error: unknown): ProviderStatus => ({ ok: false, reason: errorMessage(error) }),
        );
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
          needsKey: id === "openrouter",
          hasKey: keyed ? this.store.key(id as KeyedEngine) !== null : false,
          baseUrl:
            id === "ollama"
              ? settings.ollama.baseUrl
              : id === "openai-compatible"
                ? settings.custom.baseUrl
                : id === "openrouter"
                  ? OPENROUTER_URL
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
    const known = ACP_MODELS[engine];
    if (known) return known.map((id) => ({ id, label: id, free: engine === "gemini-cli" }));
    if (descriptionOf(engine).kind === "acp") return [];
    if (engine === "ollama") {
      const body = await this.getJson(`${settings.ollama.baseUrl}/api/tags`);
      const models = isRecord(body) && Array.isArray(body.models) ? body.models : [];
      return models
        .filter(isRecord)
        .map((m) => String(m.name ?? m.model ?? ""))
        .filter(Boolean)
        .map((id) => ({ id, label: id, free: true }));
    }
    if (engine === "openrouter") {
      const body = await this.getJson(`${OPENROUTER_URL}/models`);
      const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];
      return data
        .filter(isRecord)
        .filter(
          (m) => Array.isArray(m.supported_parameters) && m.supported_parameters.includes("tools"),
        )
        .map((m) => {
          const id = String(m.id);
          const pricing = isRecord(m.pricing) ? m.pricing : {};
          const free =
            id.endsWith(":free") || (pricing.prompt === "0" && pricing.completion === "0");
          return { id, label: typeof m.name === "string" ? m.name : id, free };
        })
        .sort((a, b) => Number(b.free) - Number(a.free) || a.label.localeCompare(b.label));
    }
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

  private async getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const res = await this.fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
    return res.json();
  }

  private async checkOpenRouter(): Promise<ProviderStatus> {
    const key = this.store.key("openrouter");
    if (!key) return { ok: false, reason: "Add your OpenRouter API key." };
    try {
      const res = await this.fetch(`${OPENROUTER_URL}/key`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401 || res.status === 403)
        return { ok: false, reason: "OpenRouter rejected the API key." };
      if (!res.ok) return { ok: false, reason: `OpenRouter answered HTTP ${res.status}.` };
      const body: unknown = await res.json();
      const data = isRecord(body) && isRecord(body.data) ? body.data : {};
      return { ok: true, detail: data.is_free_tier === true ? "free tier" : "paid" };
    } catch (error) {
      return { ok: false, reason: `OpenRouter is not reachable (${errorMessage(error)}).` };
    }
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

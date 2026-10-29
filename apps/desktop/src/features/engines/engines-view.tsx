import type { EngineId, EngineModel } from "@aura/shared";
import { Check, Cpu, KeyRound, RefreshCw } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { loadProviderStatus, reportError } from "@/features/chat/actions";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SandboxCard } from "./sandbox-card";

type EnginesData = Awaited<ReturnType<typeof loadEngines>>;
type Engine = EnginesData["engines"][number];
type Agent = Awaited<ReturnType<typeof loadAgents>>[number];

const loadEngines = () => call(() => api.engines.get());
const loadAgents = () => call(() => api.agents.get());

const GROUPS: { title: string; text: string; kinds: Engine["kind"][] }[] = [
  {
    title: "Agent apps",
    text: "Complete coding agents you install and log in to yourself. Aura drives them and decides what they may touch; your login stays with them.",
    kinds: ["official", "acp"],
  },
  {
    title: "Aura's own agent",
    text: "Aura's built-in agent loop on any model: cloud models through an API key, or local models for free.",
    kinds: ["aura"],
  },
];

const KIND_LABEL: Record<Engine["kind"], string> = {
  official: "Agent SDK",
  acp: "Agent app · ACP",
  aura: "Aura loop",
};

const inputClass =
  "bg-background focus:border-primary/60 focus:ring-primary/15 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-4";

/**
 * Agent engines (ADR 0011): Claude Code under the user's own login, or Aura's own agent loop on
 * OpenRouter (free models available), Ollama (local, free) or any OpenAI-compatible server.
 */
export function EnginesView() {
  const [data, setData] = useState<EnginesData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [engines, list] = await Promise.all([loadEngines(), loadAgents()]);
      setData(engines);
      setAgents(list);
    } catch (error) {
      reportError(error);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSettings = async (patch: Parameters<typeof api.engines.settings.put>[0]) => {
    try {
      setData(await call(() => api.engines.settings.put(patch)));
      await loadProviderStatus();
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Helper programs" icon={<Cpu className="text-primary size-7" />}>
          What runs your agents: an agent app you already use (Claude Code, Gemini CLI, Codex,
          OpenCode) under your own login, or Aura's own agent on any model, free with local models.
          Each agent can use a different engine.
        </PageHeader>

        <div className="mb-2 flex justify-end">
          <Button size="sm" variant="ghost" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} /> Check again
          </Button>
        </div>
        {!data ? (
          <p className="text-muted-foreground text-sm">Checking engines…</p>
        ) : (
          GROUPS.map((group) => (
            <section key={group.title} className="mb-8">
              <h2 className="kicker">{group.title}</h2>
              <p className="text-muted-foreground mt-1 mb-4 text-sm">{group.text}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {data.engines
                  .filter((engine) => group.kinds.includes(engine.kind))
                  .map((engine) => (
                    <EngineCard
                      key={engine.id}
                      engine={engine}
                      onSave={saveSettings}
                      onKey={async (key) => {
                        if (engine.id !== "openrouter" && engine.id !== "openai-compatible") return;
                        try {
                          await call(() => api.engines({ engine: engine.id }).key.put({ key }));
                          await refresh();
                          await loadProviderStatus();
                        } catch (error) {
                          reportError(error);
                        }
                      }}
                    />
                  ))}
              </div>
            </section>
          ))
        )}

        <SandboxCard />

        {data && (
          <AgentEngines
            agents={agents}
            engines={data.engines}
            defaultEngine={data.default}
            onSaved={(next) =>
              setAgents((list) =>
                list.map((a) => (a.handle === next.handle ? { ...a, ...next } : a)),
              )
            }
          />
        )}
      </div>
    </section>
  );
}

/** Renders `command` spans in server hints as code. */
function withCode(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
      <code key={i} className="bg-muted rounded px-1 font-mono text-[12px]">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function StatusLine({ engine }: { engine: Engine }) {
  const { status } = engine;
  return (
    <p className="flex items-start gap-2 text-[13px]">
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          status.ok ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      <span className={status.ok ? "" : "text-muted-foreground"}>
        {status.ok ? `Ready${status.detail ? ` · ${status.detail}` : ""}` : withCode(status.reason)}
      </span>
    </p>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="block">
      <span className="kicker mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function useModels(engine: EngineId, enabled: boolean) {
  const [models, setModels] = useState<EngineModel[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    call(() => api.engines({ engine }).models.get())
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch(() => {
        // The engine is unreachable: the model can still be typed by hand.
      });
    return () => {
      cancelled = true;
    };
  }, [engine, enabled]);
  return models;
}

function ModelInput({
  models,
  value,
  onChange,
  placeholder,
  label,
}: {
  models: EngineModel[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
}) {
  const listId = useId();
  return (
    <>
      <input
        aria-label={label}
        className={cn(inputClass, "font-mono text-[13px]")}
        list={listId}
        value={value}
        placeholder={placeholder ?? (models[0]?.id || "model id")}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {models.slice(0, 300).map((m) => (
          <option key={m.id} value={m.id}>
            {m.free ? `${m.label} · free` : m.label}
          </option>
        ))}
      </datalist>
    </>
  );
}

function EngineCard({
  engine,
  onSave,
  onKey,
}: {
  engine: Engine;
  onSave: (patch: Parameters<typeof api.engines.settings.put>[0]) => Promise<void>;
  onKey: (key: string | null) => Promise<void>;
}) {
  const [model, setModel] = useState(engine.model ?? "");
  const [baseUrl, setBaseUrl] = useState(engine.baseUrl ?? "");
  const [label, setLabel] = useState(engine.label);
  const [key, setKey] = useState("");
  const [freeOnly, setFreeOnly] = useState(true);
  const keyed = engine.id === "openrouter" || engine.id === "openai-compatible";
  const models = useModels(engine.id, engine.status.ok || engine.kind !== "aura").filter(
    (m) => !(engine.id === "openrouter" && freeOnly) || m.free,
  );

  // With no model typed, take the first one the server offers (the placeholder shows it).
  const save = () =>
    onSave({
      models: { [engine.id]: model.trim() || models[0]?.id || null },
      ...(engine.id === "ollama" ? { ollamaBaseUrl: baseUrl } : {}),
      ...(engine.id === "openai-compatible" ? { customBaseUrl: baseUrl, customLabel: label } : {}),
    });

  return (
    <article
      className={cn(
        "bg-card flex flex-col gap-3 rounded-2xl border p-5",
        engine.isDefault && "border-primary/50 ring-primary/10 ring-4",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <span className="kicker">{KIND_LABEL[engine.kind]}</span>
          <h3 className="text-[17px] font-semibold tracking-tight">{engine.label}</h3>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {engine.free && (
            <span className="bg-primary/10 text-primary rounded-pill px-2 py-0.5 text-[11px] font-medium">
              free option
            </span>
          )}
          {engine.isDefault && (
            <span className="bg-primary text-primary-foreground rounded-pill px-2 py-0.5 text-[11px] font-medium">
              default
            </span>
          )}
        </div>
      </header>
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        {withCode(engine.description)}
      </p>
      <StatusLine engine={engine} />

      {engine.id === "openai-compatible" && (
        <Field label="Name">
          <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      )}
      {(engine.id === "ollama" || engine.id === "openai-compatible") && (
        <Field label="Server URL">
          <input
            className={cn(inputClass, "font-mono text-[13px]")}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </Field>
      )}
      {keyed && (
        <Field
          label={
            engine.hasKey ? "API key · saved" : engine.needsKey ? "API key" : "API key (optional)"
          }
        >
          <div className="flex gap-2">
            <input
              className={cn(inputClass, "font-mono text-[13px]")}
              type="password"
              autoComplete="off"
              value={key}
              placeholder={engine.hasKey ? "••••••••  (stored on this computer)" : "sk-…"}
              onChange={(e) => setKey(e.target.value)}
            />
            {key ? (
              <Button
                size="sm"
                className="h-auto rounded-xl"
                onClick={() => void onKey(key.trim()).then(() => setKey(""))}
              >
                <KeyRound /> Save
              </Button>
            ) : (
              engine.hasKey && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto"
                  onClick={() => void onKey(null)}
                >
                  Remove
                </Button>
              )
            )}
          </div>
          {engine.id === "openrouter" && !engine.hasKey && (
            <span className="text-muted-foreground mt-1 block text-xs">
              Create a free key at openrouter.ai/keys. It stays on this computer and is sent only to
              OpenRouter.
            </span>
          )}
        </Field>
      )}

      <Field label="Default model">
        <ModelInput
          label={`${engine.label} default model`}
          models={models}
          value={model}
          onChange={setModel}
          placeholder={
            engine.id === "ollama" && models.length === 0
              ? "qwen3:8b"
              : engine.kind === "acp" && models.length === 0
                ? "the agent's own default"
                : undefined
          }
        />
      </Field>
      {engine.id === "openrouter" && (
        <label className="text-muted-foreground -mt-1 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
          />
          Show free models only
        </label>
      )}
      {engine.kind === "aura" && (
        <p className="text-muted-foreground text-xs">
          Tools: files, search, shell, web fetch and your MCP servers. Smaller models follow tools
          less reliably; prefer models marked for tool use.
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="rounded-pill" onClick={() => void save()}>
          <Check /> Save
        </Button>
        {!engine.isDefault && engine.status.ok && (
          <Button
            size="sm"
            className="rounded-pill"
            onClick={() => void save().then(() => onSave({ default: engine.id }))}
          >
            Use for all agents
          </Button>
        )}
      </div>
    </article>
  );
}

function AgentEngines({
  agents,
  engines,
  defaultEngine,
  onSaved,
}: {
  agents: Agent[];
  engines: Engine[];
  defaultEngine: EngineId;
  onSaved: (next: { handle: string; engine: EngineId | null; model: string | null }) => void;
}) {
  const defaultLabel = engines.find((e) => e.id === defaultEngine)?.label ?? defaultEngine;
  return (
    <section className="mt-10">
      <h2 className="kicker mb-1">Per agent</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Mix engines in one team: a strong model for the coder, a free one for the reviewer.
      </p>
      <div className="bg-card divide-y rounded-2xl border">
        {agents.map((agent) => (
          <AgentRow
            key={agent.handle}
            agent={agent}
            engines={engines}
            defaultLabel={defaultLabel}
            onSaved={onSaved}
          />
        ))}
      </div>
    </section>
  );
}

function AgentRow({
  agent,
  engines,
  defaultLabel,
  onSaved,
}: {
  agent: Agent;
  engines: Engine[];
  defaultLabel: string;
  onSaved: (next: { handle: string; engine: EngineId | null; model: string | null }) => void;
}) {
  const [engine, setEngine] = useState<EngineId | "">(agent.engine ?? "");
  const [model, setModel] = useState(agent.model ?? "");
  const [saved, setSaved] = useState(false);
  const dirty = (agent.engine ?? "") !== engine || (agent.model ?? "") !== model;
  const chosen = engines.find((e) => e.id === engine);
  const models = useModels(
    engine || "claude-code",
    engine !== "" && (chosen?.status.ok === true || chosen?.kind !== "aura"),
  );

  const save = async () => {
    try {
      const next = await call(() =>
        api.agents({ handle: agent.handle }).engine.put({
          engine: engine || null,
          model: model.trim() || null,
        }),
      );
      onSaved(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <div className="grid items-center gap-3 p-4 md:grid-cols-[1fr_12rem_14rem_auto]">
      <div className="min-w-0">
        <div className="text-sm font-medium">@{agent.handle}</div>
        <div className="text-muted-foreground truncate text-xs">{agent.role}</div>
      </div>
      <select
        className={inputClass}
        value={engine}
        onChange={(e) => {
          setEngine(e.target.value as EngineId | "");
          setModel("");
        }}
      >
        <option value="">Default ({defaultLabel})</option>
        {engines.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </select>
      {engine ? (
        <ModelInput
          label={`@${agent.handle} model`}
          models={models}
          value={model}
          onChange={setModel}
          placeholder={chosen?.model ?? "engine default"}
        />
      ) : (
        <span className="text-muted-foreground text-xs">Engine's default model</span>
      )}
      <Button
        size="sm"
        variant={dirty ? "default" : "ghost"}
        className="rounded-pill"
        disabled={!dirty}
        onClick={() => void save()}
      >
        {saved ? <Check /> : null} {saved ? "Saved" : "Save"}
      </Button>
    </div>
  );
}

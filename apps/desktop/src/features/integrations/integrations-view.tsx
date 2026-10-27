import {
  Check,
  CircleAlert,
  CircleCheck,
  Globe,
  KeyRound,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { loadProjects, reportError } from "@/features/chat/actions";
import { useChatStore } from "@/features/chat/store";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EnvEditor, type EnvRow, envFromRows, rowsFromEnv } from "./env-editor";

type Overview = Awaited<ReturnType<typeof loadOverview>>;
type Server = Overview["servers"][number];
type Probe = Awaited<ReturnType<typeof testServer>>;
type HostResult = Awaited<ReturnType<typeof checkHost>>;

const loadOverview = () => call(() => api.integrations.get());
const testServer = (name: string) => call(() => api.integrations.mcp({ name }).test.post());
const checkHost = (url: string) => call(() => api.integrations["check-host"].post({ url }));

export const inputClass =
  "bg-background focus:border-primary/60 focus:ring-primary/15 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-4";

/**
 * Integrations (ADR 0020): MCP tool servers with their agents, the secrets they use, and a host
 * check, all managed here by the user. Changes apply from each agent's next run.
 */
export function IntegrationsView() {
  const [data, setData] = useState<Overview | null>(null);
  const [editing, setEditing] = useState<Server | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await loadOverview());
    } catch (error) {
      reportError(error);
    }
  }, []);

  useEffect(() => {
    void load();
    loadProjects().catch(reportError);
  }, [load]);

  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Integrations" icon={<Plug className="text-primary size-7" />}>
          Tool servers (MCP) give agents new abilities: a tracker, a database, an internal API. Add
          one here, choose which agents get it, keep its keys under Secrets, and test it. Changes
          apply from each agent's next reply; nothing needs a restart.
        </PageHeader>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="kicker">MCP servers</h2>
          {editing === null && (
            <Button size="sm" className="rounded-full" onClick={() => setEditing("new")}>
              <Plus /> Add server
            </Button>
          )}
        </div>
        {editing === "new" && (
          <ServerForm
            secrets={data?.secrets ?? []}
            onDone={() => {
              setEditing(null);
              void load();
            }}
          />
        )}
        {data === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : data.servers.length === 0 && editing === null ? (
          <p className="text-muted-foreground mb-8 text-sm">
            No servers yet. Add one with its command (for example{" "}
            <code className="font-mono">python3 /path/to/server.py</code>) or its URL.
          </p>
        ) : (
          <ul className="mb-8 grid gap-3">
            {data.servers.map((server) =>
              editing !== "new" && editing?.name === server.name ? (
                <ServerForm
                  key={server.name}
                  server={server}
                  secrets={data.secrets}
                  onDone={() => {
                    setEditing(null);
                    void load();
                  }}
                />
              ) : (
                <ServerCard
                  key={server.name}
                  server={server}
                  onEdit={() => setEditing(server)}
                  onRemoved={() => void load()}
                  onChanged={() => void load()}
                />
              ),
            )}
          </ul>
        )}

        <VariableSets
          sets={data?.variableSets ?? []}
          secrets={data?.secrets ?? []}
          onChanged={() => void load()}
        />
        <Secrets names={data?.secrets ?? []} onChanged={() => void load()} />
        <HostCheck />
      </div>
    </section>
  );
}

function ServerCard({
  server,
  onEdit,
  onRemoved,
  onChanged,
}: {
  server: Server;
  onEdit: () => void;
  onRemoved: () => void;
  onChanged: () => void;
}) {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const target = server.url ?? [server.command, ...server.args].join(" ");

  const test = async () => {
    setBusy(true);
    setProbe(null);
    try {
      setProbe(await testServer(server.name));
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  // Gives the server the stored secrets it asked for, then tests again.
  const give = async (names: string[]) => {
    setBusy(true);
    try {
      const env = Object.fromEntries(server.env.map((e) => [e.name, e.value]));
      for (const n of names) env[n] = ["$", "{secret:", n, "}"].join("");
      await call(() =>
        api.integrations.mcp({ name: server.name }).put({
          command: server.command ?? undefined,
          args: server.args,
          env,
          agents: server.agents,
        }),
      );
      onChanged();
      setProbe(await testServer(server.name));
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove the MCP server "${server.name}"?`)) return;
    try {
      await call(() => api.integrations.mcp({ name: server.name }).delete());
      onRemoved();
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <li className="bg-card rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{server.name}</div>
          <code className="text-muted-foreground mt-0.5 block truncate font-mono text-[12px]">
            {target}
          </code>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {server.agents.length === 0 ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                No agent has it yet
              </span>
            ) : (
              server.agents.map((a) => (
                <span key={a} className="bg-muted rounded-full px-2 py-0.5 font-mono text-[11px]">
                  @{a}
                </span>
              ))
            )}
            {server.env.map((e) => (
              <span
                key={e.name}
                title={e.set ? "Has a value" : "No value: set it under Secrets"}
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[11px]",
                  !e.set && "border-amber-500/50 text-amber-600 dark:text-amber-400",
                )}
              >
                {e.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={() => void test()}
          >
            {busy ? <RefreshCw className="animate-spin" /> : <Play />} Test
          </Button>
          <Button variant="ghost" size="icon" aria-label="Edit" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => void remove()}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {probe && <ProbeResult probe={probe} busy={busy} onGive={(names) => void give(names)} />}
    </li>
  );
}

function ProbeResult({
  probe,
  busy,
  onGive,
}: {
  probe: Probe;
  busy: boolean;
  onGive: (names: string[]) => void;
}) {
  return (
    <div className="bg-background mt-3 rounded-xl border p-3 text-[13px]">
      <p
        className={cn(
          "flex items-start gap-1.5",
          probe.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
        )}
      >
        {probe.ok ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
        )}
        {probe.ok
          ? `Works (${probe.ms} ms): ${probe.tools.length} tool${probe.tools.length === 1 ? "" : "s"}.`
          : probe.error}
      </p>
      {probe.ok && probe.error && (
        <p className="mt-1 text-amber-600 dark:text-amber-400">{probe.error}</p>
      )}
      {probe.unpassed.length > 0 && (
        <Button
          size="sm"
          className="mt-2 rounded-full"
          disabled={busy}
          onClick={() => onGive(probe.unpassed)}
        >
          <KeyRound /> Give {probe.unpassed.join(", ")} to this server
        </Button>
      )}
      {probe.tools.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {probe.tools.map((tool) => (
            <li key={tool.name}>
              <code className="font-mono text-[12px]">{tool.name}</code>
              {tool.description && (
                <span className="text-muted-foreground"> · {tool.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {probe.log && (
        <details className="mt-2">
          <summary className="text-muted-foreground cursor-pointer text-xs">Server log</summary>
          <pre className="bg-muted mt-1 max-h-48 overflow-auto rounded-lg p-2 font-mono text-[11px] whitespace-pre-wrap">
            {probe.log}
          </pre>
        </details>
      )}
    </div>
  );
}

function ServerForm({
  server,
  secrets,
  onDone,
}: {
  server?: Server;
  secrets: string[];
  onDone: () => void;
}) {
  const agentMap = useChatStore((s) => s.agents);
  const allAgents = useMemo(() => Object.values(agentMap), [agentMap]);
  const [name, setName] = useState(server?.name ?? "");
  const [kind, setKind] = useState<"stdio" | "http">(server?.kind ?? "stdio");
  const [command, setCommand] = useState(server?.command ?? "");
  const [args, setArgs] = useState((server?.args ?? []).join("\n"));
  const [url, setUrl] = useState(server?.url ?? "");
  const [env, setEnv] = useState<EnvRow[]>(rowsFromEnv(server?.env ?? []));
  const [headers, setHeaders] = useState<HeaderRow[]>(
    (server?.headers ?? []).map((h) => ({ id: crypto.randomUUID(), name: h.name, value: h.value })),
  );
  const [agents, setAgents] = useState<string[]>(server?.agents ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { env: envMap, secrets: newSecrets } = envFromRows(env);
      for (const [secret, value] of Object.entries(newSecrets)) {
        await call(() => api.integrations.secrets({ name: secret }).put({ value }));
      }
      await call(() =>
        api.integrations.mcp({ name: name.trim() }).put(
          kind === "http"
            ? {
                url: url.trim(),
                headers: Object.fromEntries(
                  headers.filter((h) => h.name.trim()).map((h) => [h.name.trim(), h.value]),
                ),
                agents,
              }
            : {
                command: command.trim(),
                args: args
                  .split("\n")
                  .map((a) => a.trim())
                  .filter(Boolean),
                env: envMap,
                agents,
              },
        ),
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card mb-3 rounded-2xl border p-4">
      <div className="grid gap-3">
        <label className="block">
          <span className="kicker mb-1 block">Name</span>
          <input
            className={cn(inputClass, "w-full font-mono text-[13px]")}
            placeholder="tracker"
            value={name}
            disabled={Boolean(server)}
            onChange={(e) => setName(e.target.value.toLowerCase())}
          />
        </label>
        <div className="flex gap-2">
          {(["stdio", "http"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "flex-1 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                kind === k ? "border-primary bg-primary/5" : "hover:bg-accent/60",
              )}
            >
              <div className="font-medium">{k === "stdio" ? "A command" : "A URL"}</div>
              <div className="text-muted-foreground text-xs">
                {k === "stdio" ? "Aura starts it on this computer" : "A server that already runs"}
              </div>
            </button>
          ))}
        </div>
        {kind === "stdio" ? (
          <>
            <label className="block">
              <span className="kicker mb-1 block">Command</span>
              <input
                className={cn(inputClass, "w-full font-mono text-[13px]")}
                placeholder="/usr/bin/python3"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="kicker mb-1 block">Arguments, one per line</span>
              <textarea
                className={cn(inputClass, "h-20 w-full font-mono text-[13px]")}
                placeholder="/path/to/server.py"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />
            </label>
            <div>
              <span className="kicker mb-1 block">Variables</span>
              <EnvEditor rows={env} secrets={secrets} onChange={setEnv} />
            </div>
          </>
        ) : (
          <label className="block">
            <span className="kicker mb-1 block">URL</span>
            <input
              className={cn(inputClass, "w-full font-mono text-[13px]")}
              placeholder="https://mcp.example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        )}
        {kind === "http" && (
          <div>
            <span className="kicker mb-1 block">Headers</span>
            <HeadersEditor rows={headers} secrets={secrets} onChange={setHeaders} />
          </div>
        )}
        <div>
          <span className="kicker mb-1 block">Agents that get its tools</span>
          <div className="flex flex-wrap gap-1.5">
            {allAgents
              .filter((a) => a.handle !== "orchestrator")
              .map((a) => {
                const on = agents.includes(a.handle);
                return (
                  <button
                    key={a.handle}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setAgents(on ? agents.filter((x) => x !== a.handle) : [...agents, a.handle])
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 font-mono text-[12px] transition-colors",
                      on ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent/60",
                    )}
                  >
                    @{a.handle}
                  </button>
                );
              })}
          </div>
        </div>
      </div>
      {error && <p className="text-destructive mt-3 text-xs">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          className="rounded-full"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
        >
          {busy ? <RefreshCw className="animate-spin" /> : <Check />} Save
        </Button>
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onDone}>
          <X /> Cancel
        </Button>
      </div>
    </div>
  );
}

function Secrets({ names, onChanged }: { names: string[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const set = async (secret: string, next: string | null) => {
    setError(null);
    try {
      await call(() => api.integrations.secrets({ name: secret }).put({ value: next }));
      setName("");
      setValue("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="mb-8">
      <h2 className="kicker mb-1">Secrets</h2>
      <p className="text-muted-foreground mb-3 text-[13px]">
        Keys and passwords, kept on this computer, outside your data folder's history, and never
        shown again. A secret does nothing on its own: give it to an agent as a variable on the
        Agents page (or to a server above), where stored secrets are one click away. In files it
        appears as{" "}
        <code className="font-mono">
          {"$"}
          {"{secret:NAME}"}
        </code>
        .
      </p>
      <div className="bg-card rounded-2xl border p-4">
        {names.length > 0 && (
          <ul className="mb-3 divide-y">
            {names.map((n) => (
              <li key={n} className="flex items-center gap-2 py-1.5">
                <KeyRound className="text-muted-foreground size-4" />
                <code className="flex-1 font-mono text-[13px]">{n}</code>
                <Button variant="ghost" size="sm" onClick={() => setName(n)}>
                  Replace
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${n}`}
                  onClick={() => window.confirm(`Delete the secret ${n}?`) && void set(n, null)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && value) void set(name.trim(), value);
          }}
        >
          <input
            className={cn(inputClass, "min-w-40 flex-1 font-mono text-[13px]")}
            placeholder="SERVICE_API_KEY"
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
          />
          <input
            type="password"
            autoComplete="off"
            className={cn(inputClass, "min-w-40 flex-1")}
            placeholder="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            className="h-auto rounded-full"
            disabled={!name.trim() || !value}
          >
            <Check /> Save secret
          </Button>
        </form>
        {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
      </div>
    </section>
  );
}

function HostCheck() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<HostResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await checkHost(url.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8">
      <h2 className="kicker mb-1">Check a host</h2>
      <p className="text-muted-foreground mb-3 text-[13px]">
        Can Aura reach a service, for example a tracker behind your VPN, and may agents' commands?
      </p>
      <div className="bg-card rounded-2xl border p-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) void run();
          }}
        >
          <label className="relative min-w-60 flex-1">
            <Globe className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input
              className={cn(inputClass, "w-full pl-9 font-mono text-[13px]")}
              placeholder="https://service.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-auto rounded-full"
            disabled={busy || !url.trim()}
          >
            {busy ? <RefreshCw className="animate-spin" /> : <Play />} Check
          </Button>
        </form>
        {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
        {result && (
          <div className="mt-3 space-y-1 text-[13px]">
            <p
              className={cn(
                "flex items-start gap-1.5",
                result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
              )}
            >
              {result.ok ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
              )}
              {result.ok
                ? `${result.host} answers (HTTP ${result.status}, ${result.ms} ms).`
                : `${result.host}: ${result.error}`}
            </p>
            {result.sandbox.active && !result.sandbox.allowed && (
              <p className="text-amber-600 dark:text-amber-400">
                Agents' commands cannot reach {result.host}: add it to the allowed hosts in the
                Command sandbox card on the Engines page. MCP servers are not limited by it.
              </p>
            )}
            {result.sandbox.active && result.sandbox.allowed && (
              <p className="text-muted-foreground">Agents' commands may reach this host.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

interface HeaderRow {
  id: string;
  name: string;
  value: string;
}

/** Headers for a server at a URL; credentials come from stored secrets, never typed in here. */
function HeadersEditor({
  rows,
  secrets,
  onChange,
}: {
  rows: HeaderRow[];
  secrets: string[];
  onChange: (rows: HeaderRow[]) => void;
}) {
  const ref = (name: string) => ["$", "{secret:", name, "}"].join("");
  const update = (id: string, patch: Partial<HeaderRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center gap-2">
          <input
            className={cn(inputClass, "w-44 font-mono text-[13px]")}
            placeholder="Authorization"
            value={row.name}
            onChange={(e) => update(row.id, { name: e.target.value.replace(/[^A-Za-z0-9-]/g, "") })}
          />
          <input
            className={cn(inputClass, "min-w-48 flex-1 font-mono text-[13px]")}
            placeholder={`Bearer ${ref("SERVICE_TOKEN")}`}
            value={row.value}
            onChange={(e) => update(row.id, { value: e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${row.name || "header"}`}
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={() => onChange([...rows, { id: crypto.randomUUID(), name: "", value: "" }])}
        >
          <Plus /> Add header
        </Button>
        {secrets.map((s) => (
          <button
            key={s}
            type="button"
            title={`Authorization: Bearer ${ref(s)}`}
            onClick={() =>
              onChange([
                ...rows.filter((r) => r.name.toLowerCase() !== "authorization"),
                { id: crypto.randomUUID(), name: "Authorization", value: `Bearer ${ref(s)}` },
              ])
            }
            className="hover:bg-accent/60 flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]"
          >
            <KeyRound className="size-3" /> Bearer {s}
          </button>
        ))}
      </div>
    </div>
  );
}

type VariableSet = Overview["variableSets"][number];

/** Agents to give something to, as toggles. */
function AgentPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const agentMap = useChatStore((s) => s.agents);
  const agents = useMemo(
    () => Object.values(agentMap).filter((a) => a.handle !== "orchestrator"),
    [agentMap],
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {agents.map((a) => {
        const on = value.includes(a.handle);
        return (
          <button
            key={a.handle}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? value.filter((x) => x !== a.handle) : [...value, a.handle])
            }
            className={cn(
              "rounded-full border px-2.5 py-1 font-mono text-[12px] transition-colors",
              on ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent/60",
            )}
          >
            @{a.handle}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Variables for command-line tools and scripts (ADR 0020): a service's address and token, given to
 * the agents that use it. Each agent's own variables, on the Agents page, win on a clash.
 */
function VariableSets({
  sets,
  secrets,
  onChanged,
}: {
  sets: VariableSet[];
  secrets: string[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<VariableSet | "new" | null>(null);

  const remove = async (name: string) => {
    if (!window.confirm(`Remove the variables "${name}"?`)) return;
    try {
      await call(() => api.integrations.variables({ name }).delete());
      onChanged();
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <section className="mb-8">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="kicker">Variables for commands</h2>
        {editing === null && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setEditing("new")}
          >
            <Plus /> Add variables
          </Button>
        )}
      </div>
      <p className="text-muted-foreground mb-3 text-[13px]">
        For command-line tools and scripts agents run with Bash (git hosts, trackers, databases,
        your own scripts): a service's address and token, given to the agents that use it.
      </p>
      {editing === "new" && (
        <VariableSetForm
          secrets={secrets}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      <ul className="grid gap-3">
        {sets.map((set) =>
          editing !== "new" && editing?.name === set.name ? (
            <VariableSetForm
              key={set.name}
              set={set}
              secrets={secrets}
              onDone={() => {
                setEditing(null);
                onChanged();
              }}
            />
          ) : (
            <li key={set.name} className="bg-card flex items-start gap-3 rounded-2xl border p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{set.name}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {set.env.map((e) => (
                    <span
                      key={e.name}
                      title={e.set ? "Has a value" : "No value: set it under Secrets"}
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-mono text-[11px]",
                        !e.set && "border-amber-500/50 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {e.name}
                    </span>
                  ))}
                  {set.agents.length === 0 ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      No agent has it yet
                    </span>
                  ) : (
                    set.agents.map((a) => (
                      <span
                        key={a}
                        className="bg-muted rounded-full px-2 py-0.5 font-mono text-[11px]"
                      >
                        @{a}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(set)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove"
                onClick={() => void remove(set.name)}
              >
                <Trash2 />
              </Button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function VariableSetForm({
  set,
  secrets,
  onDone,
}: {
  set?: VariableSet;
  secrets: string[];
  onDone: () => void;
}) {
  const [name, setName] = useState(set?.name ?? "");
  const [env, setEnv] = useState<EnvRow[]>(rowsFromEnv(set?.env ?? []));
  const [agents, setAgents] = useState<string[]>(set?.agents ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { env: envMap, secrets: newSecrets } = envFromRows(env);
      for (const [secret, value] of Object.entries(newSecrets)) {
        await call(() => api.integrations.secrets({ name: secret }).put({ value }));
      }
      await call(() =>
        api.integrations.variables({ name: name.trim() }).put({ env: envMap, agents }),
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card mb-3 rounded-2xl border p-4">
      <div className="grid gap-3">
        <label className="block">
          <span className="kicker mb-1 block">Name</span>
          <input
            className={cn(inputClass, "w-full font-mono text-[13px]")}
            placeholder="git-host"
            value={name}
            disabled={Boolean(set)}
            onChange={(e) => setName(e.target.value.toLowerCase())}
          />
        </label>
        <div>
          <span className="kicker mb-1 block">Variables</span>
          <EnvEditor rows={env} secrets={secrets} onChange={setEnv} />
        </div>
        <div>
          <span className="kicker mb-1 block">Agents whose commands get them</span>
          <AgentPicker value={agents} onChange={setAgents} />
        </div>
      </div>
      {error && <p className="text-destructive mt-3 text-xs">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          className="rounded-full"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
        >
          {busy ? <RefreshCw className="animate-spin" /> : <Check />} Save
        </Button>
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onDone}>
          <X /> Cancel
        </Button>
      </div>
    </div>
  );
}

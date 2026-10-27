import {
  Bot,
  Check,
  CircleAlert,
  MessagesSquare,
  Plug,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Mark } from "@/components/mark";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { loadProjects, openChat, reportError } from "@/features/chat/actions";
import { useChatStore } from "@/features/chat/store";
import {
  EnvEditor,
  type EnvRow,
  envFromRows,
  rowsFromEnv,
} from "@/features/integrations/env-editor";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = Awaited<ReturnType<typeof loadStatus>>;
const loadStatus = (handle: string) => call(() => api.agents({ handle }).status.get());

const TOOLS: { name: string; text: string }[] = [
  { name: "Read", text: "read files" },
  { name: "Write", text: "create files" },
  { name: "Edit", text: "change files" },
  { name: "Glob", text: "find files" },
  { name: "Grep", text: "search in files" },
  { name: "Bash", text: "run commands" },
  { name: "WebSearch", text: "search the web" },
  { name: "WebFetch", text: "open web pages" },
];

/**
 * Every agent and what it can really do (ADR 0020): engine, tools on that engine, variables, tool
 * servers, chats, the last error and what stops it, editable in one place.
 */
export function AgentsView() {
  const agentMap = useChatStore((s) => s.agents);
  const agents = useMemo(() => Object.values(agentMap), [agentMap]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    loadProjects().catch(reportError);
  }, []);
  const current =
    selected ?? agents.find((a) => a.handle !== "orchestrator")?.handle ?? "orchestrator";

  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Agents" icon={<Bot className="text-primary size-7" />}>
          What each agent runs on, which tools and variables it has, where you can reach it, and
          anything that stops it from working. Changes apply from its next reply.
        </PageHeader>
        <div className="mb-6 flex flex-wrap gap-1.5">
          {agents.map((a) => (
            <button
              key={a.handle}
              type="button"
              onClick={() => setSelected(a.handle)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
                current === a.handle ? "border-primary bg-primary/10" : "hover:bg-accent/60",
              )}
            >
              <Mark
                name={a.handle}
                kind={a.handle === "orchestrator" ? "orchestrator" : "agent"}
                size="xs"
              />
              @{a.handle}
            </button>
          ))}
        </div>
        <AgentCard key={current} handle={current} />
      </div>
    </section>
  );
}

function AgentCard({ handle }: { handle: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [env, setEnv] = useState<EnvRow[]>([]);
  const [secrets, setSecrets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const apply = useCallback((s: Status) => {
    setStatus(s);
    setTools(s.tools);
    setEnv(rowsFromEnv(s.env));
  }, []);

  useEffect(() => {
    loadStatus(handle)
      .then(apply)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    call(() => api.integrations.get())
      .then((o) => setSecrets(o.secrets))
      .catch(reportError);
  }, [handle, apply]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!status) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const dirty =
    JSON.stringify(tools) !== JSON.stringify(status.tools) ||
    JSON.stringify(envFromRows(env)) !== JSON.stringify(envFromRows(rowsFromEnv(status.env)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { env: envMap, secrets: newSecrets } = envFromRows(env);
      for (const [name, value] of Object.entries(newSecrets)) {
        await call(() => api.integrations.secrets({ name }).put({ value }));
      }
      apply(await call(() => api.agents({ handle }).settings.put({ tools, env: envMap })));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const ready = status.engine.status.ok;
  return (
    <div className="grid gap-4">
      <div className="bg-card rounded-2xl border p-5">
        <div className="flex items-start gap-3">
          <Mark
            name={handle}
            kind={handle === "orchestrator" ? "orchestrator" : "agent"}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {status.name}{" "}
              <span className="text-muted-foreground font-mono text-sm">@{handle}</span>
            </div>
            <p className="text-muted-foreground text-sm">{status.role}</p>
            <p className="mt-2 flex items-center gap-1.5 text-[13px]">
              <span
                className={cn("size-2 rounded-full", ready ? "bg-emerald-500" : "bg-amber-500")}
              />
              {status.engine.label}
              {status.model ? ` · ${status.model}` : ""}
              {!ready && " · not ready"}
            </p>
          </div>
        </div>
        {status.warnings.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[13px]">
            {status.warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                {w}
              </li>
            ))}
          </ul>
        )}
        {status.lastRun && (
          <p className="text-muted-foreground mt-3 flex items-start gap-1.5 text-xs">
            {status.lastRun.status === "error" && (
              <CircleAlert className="text-destructive size-3.5 shrink-0" />
            )}
            Last reply {new Date(status.lastRun.at).toLocaleString()}: {status.lastRun.status}
          </p>
        )}
      </div>

      <div className="bg-card rounded-2xl border p-5">
        <h3 className="kicker mb-2">Tools</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOOLS.map((tool) => {
            const on = tools.includes(tool.name);
            const missing = on && status.unsupported.includes(tool.name);
            return (
              <button
                key={tool.name}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setTools(on ? tools.filter((t) => t !== tool.name) : [...tools, tool.name])
                }
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  on ? "border-primary bg-primary/5" : "hover:bg-accent/60",
                )}
              >
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {tool.name}
                  {missing && <TriangleAlert className="size-3.5 text-amber-500" />}
                </div>
                <div className="text-muted-foreground text-xs">
                  {missing ? `not on ${status.engine.label}` : tool.text}
                </div>
              </button>
            );
          })}
        </div>

        <h3 className="kicker mt-5 mb-1">Variables for its commands</h3>
        <p className="text-muted-foreground mb-2 text-xs">
          Its commands (Bash) get these, on every engine and in project containers. Keys go in as
          secrets: kept out of files and hidden in chat.
        </p>
        <EnvEditor rows={env} secrets={secrets} onChange={setEnv} />
        {status.sharedEnv.length > 0 && (
          <div className="mt-3">
            <p className="text-muted-foreground mb-1 text-xs">
              Also from variables on the Integrations page:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {status.sharedEnv.map((e) => (
                <span
                  key={e.name}
                  title={
                    e.set ? `From "${e.from}"` : `From "${e.from}", no value: set it under Secrets`
                  }
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[11px]",
                    !e.set && "border-amber-500/50 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {e.name} <span className="text-muted-foreground">· {e.from}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-destructive mt-3 text-xs">{error}</p>}
        <div className="mt-4">
          <Button
            size="sm"
            className="rounded-full"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            {busy ? <RefreshCw className="animate-spin" /> : <Check />} {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      <div className="bg-card grid gap-4 rounded-2xl border p-5 sm:grid-cols-2">
        <div>
          <h3 className="kicker mb-2 flex items-center gap-1.5">
            <Plug className="size-3.5" /> Tool servers
          </h3>
          {status.mcpServers.length === 0 ? (
            <p className="text-muted-foreground text-sm">None. Add one on the Integrations page.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {status.mcpServers.map((s) => (
                <li key={s.name}>
                  <span className="font-medium">{s.name}</span>{" "}
                  <code className="text-muted-foreground font-mono text-[11px]">{s.target}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="kicker mb-2 flex items-center gap-1.5">
            <MessagesSquare className="size-3.5" /> Chats
          </h3>
          {status.chats.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              In no chat yet. Ask the orchestrator to start a project with it.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {status.chats.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => openChat(c.id)}
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

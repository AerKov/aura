import type { MemoryNote } from "@aura/shared";
import { Brain, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Mark } from "@/components/mark";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { useChatStore } from "@/features/chat/store";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

type MemorySettings = NonNullable<Awaited<ReturnType<typeof loadSettings>>>["memory"];
const loadSettings = () => call(() => api.engines.get());

const inputClass =
  "bg-background focus:border-primary/60 focus:ring-primary/15 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-4";

/**
 * What agents remember (ADR 0013): their own notes and each project's shared notes. The user can
 * search and delete any note, and turn on semantic search with a local embedding model.
 */
export function MemoryView() {
  const projects = useChatStore((s) => s.projects);
  const [notes, setNotes] = useState<MemoryNote[] | null>(null);
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState<MemorySettings | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      setNotes(await call(() => api.memory.get({ query: q.trim() ? { q: q.trim() } : {} })));
    } catch (error) {
      reportError(error);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  useEffect(() => {
    loadSettings()
      .then((data) => setSettings(data.memory))
      .catch(reportError);
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, MemoryNote[]>();
    for (const note of notes ?? []) {
      const key = `${note.scope}:${note.owner}`;
      map.set(key, [...(map.get(key) ?? []), note]);
    }
    return [...map.entries()];
  }, [notes]);

  const remove = async (id: string) => {
    try {
      await call(() => api.memory({ id }).delete());
      setNotes((list) => list?.filter((n) => n.id !== id) ?? null);
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Memory" icon={<Brain className="text-primary size-7" />}>
          Notes agents save to remember decisions, preferences and facts across runs. Each agent has
          its own notes; agents in a project share the project's notes. The relevant ones are added
          to an agent's instructions on every run. Delete anything that is wrong.
        </PageHeader>

        {settings && (
          <SemanticSearch
            settings={settings}
            onSaved={setSettings}
            onIndexed={() => void load(query)}
          />
        )}

        <label className="relative mb-6 block">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            className={cn(inputClass, "w-full pl-9")}
            placeholder="Search notes, in any language"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        {notes === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {query
              ? "Nothing found."
              : "No notes yet. Agents save them as they work, or ask the orchestrator to remember something."}
          </p>
        ) : (
          groups.map(([key, list]) => {
            const first = list[0];
            if (!first) return null;
            const title =
              first.scope === "agent"
                ? `@${first.owner}`
                : (projects[first.owner]?.name ?? first.owner);
            return (
              <section key={key} className="mb-6">
                <h2 className="mb-2 flex items-center gap-2">
                  <Mark
                    name={first.owner}
                    kind={first.owner === "orchestrator" ? "orchestrator" : "agent"}
                    size="xs"
                  />
                  <span className="text-sm font-medium">{title}</span>
                  <span className="kicker">
                    {first.scope === "project" ? "project notes" : "agent notes"}
                  </span>
                </h2>
                <ul className="bg-card divide-y rounded-2xl border">
                  {list.map((note) => (
                    <li key={note.id} className="group flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] leading-relaxed">{note.text}</p>
                        <p className="kicker mt-1">
                          @{note.author} · {new Date(note.createdAt).toLocaleDateString()}
                          {note.semantic ? " · semantic" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Delete note"
                        onClick={() => void remove(note.id)}
                        className="text-muted-foreground hover:text-destructive rounded-full p-1.5 opacity-60 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </section>
  );
}

function SemanticSearch({
  settings,
  onSaved,
  onIndexed,
}: {
  settings: MemorySettings;
  onSaved: (settings: MemorySettings) => void;
  onIndexed: () => void;
}) {
  const [engine, setEngine] = useState<"" | "ollama" | "openai-compatible">(settings.engine ?? "");
  const [model, setModel] = useState(settings.model ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = (settings.engine ?? "") !== engine || (settings.model ?? "") !== model;

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const data = await call(() =>
        api.engines.settings.put({
          memoryEngine: engine || null,
          memoryModel: engine ? model.trim() || null : null,
        }),
      );
      onSaved(data.memory);
      if (data.memory.engine) {
        const { indexed } = await call(() => api.memory.reindex.post());
        setStatus(`Semantic search is on. ${indexed} note${indexed === 1 ? "" : "s"} indexed.`);
        onIndexed();
      } else {
        setStatus("Semantic search is off; keyword search still works.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reach the embedding model");
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card mb-6 rounded-2xl border p-4">
      <div className="mb-1 text-sm font-medium">Semantic search</div>
      <p className="text-muted-foreground mb-3 text-[13px]">
        Keyword search always works. With an embedding model, agents also find notes by meaning and
        across languages. Free and local with Ollama:{" "}
        <code className="bg-muted rounded px-1 font-mono text-[12px]">
          ollama pull nomic-embed-text
        </code>
        .
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          className={inputClass}
          value={engine}
          onChange={(e) => setEngine(e.target.value as typeof engine)}
        >
          <option value="">Off</option>
          <option value="ollama">Ollama</option>
          <option value="openai-compatible">OpenAI-compatible server</option>
        </select>
        {engine && (
          <input
            className={cn(inputClass, "min-w-48 flex-1 font-mono text-[13px]")}
            placeholder="nomic-embed-text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        )}
        <Button
          className="h-auto rounded-full"
          disabled={busy || !dirty || (engine !== "" && !model.trim())}
          onClick={() => void save()}
        >
          {busy ? <RefreshCw className="animate-spin" /> : null} Save
        </Button>
      </div>
      {status && <p className="text-muted-foreground mt-2 text-xs">{status}</p>}
    </div>
  );
}

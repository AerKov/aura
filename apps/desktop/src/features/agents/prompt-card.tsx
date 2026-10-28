import { Brain, Check, ChevronRight, FileText, History, Pencil, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { openChat, reportError } from "@/features/chat/actions";
import { useModules } from "@/features/shell/apps";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

type Explained = Awaited<ReturnType<typeof loadPrompt>>;
type Part = Explained["parts"][number];
type Run = Awaited<ReturnType<typeof loadRuns>>[number];
type Note = Awaited<ReturnType<typeof loadNotes>>[number];

const loadPrompt = (handle: string) => call(() => api.agents({ handle }).prompt.get());
const loadRuns = (handle: string) => call(() => api.agents({ handle }).runs.get());
const loadNotes = (handle: string) =>
  call(() => api.memory.get({ query: { scope: "agent", owner: handle } }));

const diffBlock = (diff: string) => `\`\`\`diff\n${diff}\n\`\`\``;

/**
 * The agent's system prompt as it runs (ADR 0032): its own prompt, editable with a diff before
 * saving and a history of versions, then each part Aura adds at run time.
 */
export function PromptCard({ handle, onSaved }: { handle: string; onSaved: () => void }) {
  const [explained, setExplained] = useState<Explained | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [version, setVersion] = useState<{ ref: string; prompt: string; diff: string } | null>(
    null,
  );
  const [open, setOpen] = useState<Set<number>>(new Set([0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    loadPrompt(handle).then(setExplained).catch(reportError);
  }, [handle]);
  useEffect(reload, [reload]);

  if (!explained) return null;
  const own = explained.parts.find((p) => p.source === "profile")?.text ?? "";

  const startReview = async () => {
    if (draft === null) return;
    setError(null);
    try {
      const { diff } = await call(() => api.agents({ handle }).prompt.diff.post({ text: draft }));
      setReview(diff);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const save = async () => {
    if (draft === null) return;
    setBusy(true);
    setError(null);
    try {
      await call(() => api.agents({ handle }).settings.put({ systemPrompt: draft }));
      setDraft(null);
      setReview(null);
      setVersion(null);
      reload();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const showVersion = async (ref: string) => {
    if (version?.ref === ref) return setVersion(null);
    try {
      setVersion({ ref, ...(await call(() => api.agents({ handle }).prompt({ ref }).get())) });
    } catch (err) {
      reportError(err);
    }
  };

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="bg-card min-w-0 rounded-2xl border p-5">
      <h3 className="kicker mb-1 flex items-center gap-1.5">
        <FileText className="size-3.5" /> System prompt
      </h3>
      <p className="text-muted-foreground mb-3 text-xs">
        Everything the agent is told before a message, in order: its own prompt, then what Aura adds
        when it runs. Only its own prompt is yours to edit.
      </p>

      {draft !== null ? (
        <div className="mb-3">
          {review === null ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="max-h-96 min-h-40 font-mono text-xs"
              aria-label="Its prompt"
            />
          ) : review.trim() === "" ? (
            <p className="text-muted-foreground text-sm">Nothing changed.</p>
          ) : (
            <div className="max-h-96 overflow-auto text-xs">
              <Markdown>{diffBlock(review)}</Markdown>
            </div>
          )}
          {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
          <div className="mt-2 flex gap-2">
            {review === null ? (
              <Button size="sm" className="rounded-full" onClick={() => void startReview()}>
                <Check /> Review changes
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={busy || review.trim() === ""}
                  onClick={() => void save()}
                >
                  {busy ? <RefreshCw className="animate-spin" /> : <Check />} Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setReview(null)}
                >
                  <Pencil /> Keep editing
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                setDraft(null);
                setReview(null);
              }}
            >
              <X /> Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="divide-y rounded-xl border">
        {explained.parts.map((part, i) => (
          <PartRow
            key={`${part.source}-${part.title}`}
            part={part}
            open={open.has(i)}
            onToggle={() => toggle(i)}
            onEdit={part.source === "profile" && draft === null ? () => setDraft(own) : undefined}
          />
        ))}
      </ul>

      {explained.history.length > 0 && (
        <div className="mt-4">
          <h4 className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
            <History className="size-3.5" /> Versions of its prompt
          </h4>
          <ul className="space-y-0.5 text-[13px]">
            {explained.history.map((v) => (
              <li key={v.ref}>
                <button
                  type="button"
                  onClick={() => void showVersion(v.ref)}
                  className={cn(
                    "hover:bg-accent/60 flex w-full items-baseline gap-2 rounded-md px-1.5 py-0.5 text-left",
                    version?.ref === v.ref && "bg-accent/60",
                  )}
                >
                  <code className="text-muted-foreground font-mono text-[11px]">{v.ref}</code>
                  <span className="min-w-0 flex-1 truncate">{v.subject}</span>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {new Date(v.date).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {version && (
            <div className="mt-2 rounded-xl border p-3">
              <div className="max-h-80 overflow-auto text-xs">
                <Markdown>{diffBlock(version.diff || "(no change to the prompt)")}</Markdown>
              </div>
              {version.prompt !== own && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 rounded-full"
                  onClick={() => {
                    setDraft(version.prompt);
                    setReview(null);
                  }}
                >
                  <History /> Bring this version back
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PartRow({
  part,
  open,
  onToggle,
  onEdit,
}: {
  part: Part;
  open: boolean;
  onToggle: () => void;
  onEdit?: () => void;
}) {
  return (
    <li>
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
          />
          <span className="truncate">{part.title}</span>
          {part.source !== "profile" && (
            <span className="text-muted-foreground shrink-0 text-[11px]">added by Aura</span>
          )}
        </button>
        {onEdit && (
          <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
        )}
      </div>
      {open && (
        <pre className="bg-muted/40 max-h-80 overflow-auto px-4 py-2 font-mono text-[11px] whitespace-pre-wrap">
          {part.text.trim()}
        </pre>
      )}
    </li>
  );
}

/**
 * What the agent remembers and what it was given (ADR 0032): its notes now, and its recent runs
 * with the notes each one got in its prompt.
 */
export function MemoryCard({ handle }: { handle: string }) {
  const modules = useModules();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadRuns(handle).then(setRuns).catch(reportError);
    if (modules.memory) loadNotes(handle).then(setNotes).catch(reportError);
    else setNotes(null);
  }, [handle, modules.memory]);

  return (
    <div className="bg-card min-w-0 rounded-2xl border p-5">
      <h3 className="kicker mb-2 flex items-center gap-1.5">
        <Brain className="size-3.5" /> Memory and recent runs
      </h3>
      {modules.memory ? (
        notes && notes.length > 0 ? (
          <>
            <p className="text-muted-foreground mb-1 text-xs">
              Its notes ({notes.length}). Each run gets the ones that match the message.
            </p>
            <ul className="mb-4 max-h-48 space-y-0.5 overflow-auto text-[13px]">
              {notes.map((n) => (
                <li key={n.id} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {n.createdAt.slice(0, 10)}
                  </span>
                  {n.text}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted-foreground mb-4 text-sm">No notes yet.</p>
        )
      ) : (
        <p className="text-muted-foreground mb-4 text-sm">Memory is off, so runs get no notes.</p>
      )}

      {runs === null ? null : runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No runs yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border text-[13px]">
          {runs.map((r) => (
            <li key={r.id} className="px-3 py-1.5">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "size-2 shrink-0 self-center rounded-full",
                    r.status === "done"
                      ? "bg-emerald-500"
                      : r.status === "error"
                        ? "bg-destructive"
                        : "bg-muted-foreground",
                  )}
                />
                <span className="text-muted-foreground shrink-0 text-[11px]">
                  {new Date(r.at).toLocaleString()}
                </span>
                <button
                  type="button"
                  className="text-primary min-w-0 truncate hover:underline"
                  onClick={() => openChat(r.chatId)}
                >
                  {r.chatTitle ?? r.chatId}
                </button>
                <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
                  {r.tools} tools · {r.tokens.toLocaleString()} tokens
                </span>
                {r.memory.length > 0 && (
                  <button
                    type="button"
                    aria-expanded={open === r.id}
                    className="text-primary shrink-0 text-[11px] hover:underline"
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                  >
                    {r.memory.length} notes
                  </button>
                )}
              </div>
              {r.error && <p className="text-destructive mt-0.5 text-xs">{r.error}</p>}
              {open === r.id && (
                <ul className="text-muted-foreground mt-1 list-disc pl-6 text-xs">
                  {r.memory.map((n) => (
                    <li key={n.id}>{n.text}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

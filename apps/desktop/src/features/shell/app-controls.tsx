import type { ExtensionInfo } from "@aura/shared";
import { Database, Eye, EyeOff, History, KeyRound, MessagesSquare, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { setState, useChatStore } from "@/features/chat/store";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

type Version = { hash: string; author: string; at: string; subject: string };

/**
 * The bar of an app built in Aura (ADR 0024): its chat (a panel inside the tile, ADR 0027), a
 * preview of changes waiting for approval, and its versions. `chat`: whether chats are on.
 */
export function AppControls({ ext, chat }: { ext: ExtensionInfo; chat: boolean }) {
  const preview = useChatStore((s) => s.previewDraft[ext.id] ?? false);
  const chatOpen = useChatStore((s) => s.appChat[ext.id] ?? false);
  const app = ext.app;
  if (!app) return null;
  const togglePreview = () =>
    setState((s) => ({ previewDraft: { ...s.previewDraft, [ext.id]: !preview } }));
  return (
    <>
      {chat && (
        <Button
          size="sm"
          variant={chatOpen ? "secondary" : "ghost"}
          className="h-7 gap-1 px-2 text-xs"
          aria-pressed={chatOpen}
          title="The app's chat: use it and change it with @builder"
          onClick={() => setAppChat(ext.id, !chatOpen)}
        >
          <MessagesSquare /> Chat
        </Button>
      )}
      {app.draft && (
        <>
          <Button
            size="sm"
            variant={preview ? "secondary" : "ghost"}
            className={cn(
              "h-7 gap-1 px-2 text-xs",
              !preview && "text-amber-600 dark:text-amber-400",
            )}
            title={
              preview
                ? "Showing the changes that wait for your approval; click to show the live version"
                : "There are changes waiting for your approval; click to try them"
            }
            onClick={togglePreview}
          >
            {preview ? <EyeOff /> : <Eye />} {preview ? "Live" : "Draft"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Discard the changes waiting for approval"
            title="Discard the changes waiting for approval"
            onClick={() => {
              setState((s) => ({ previewDraft: { ...s.previewDraft, [ext.id]: false } }));
              void call(() => api.apps({ appId: ext.id }).discard.post()).catch(reportError);
            }}
          >
            <Trash2 />
          </Button>
        </>
      )}
      <DataMenu appId={ext.id} />
      <Versions appId={ext.id} />
    </>
  );
}

/** Opens or closes an app's chat panel inside its tile. */
export function setAppChat(appId: string, open: boolean): void {
  setState((s) => ({ appChat: { ...s.appChat, [appId]: open } }));
}

export function Versions({ appId }: { appId: string }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    call(() => api.apps({ appId }).history.get())
      .then((v) => setVersions(v as Version[]))
      .catch(reportError);
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, appId]);
  return (
    <div className="relative" ref={box}>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Versions"
        title="Versions: go back to any of them"
        onClick={() => setOpen(!open)}
      >
        <History />
      </Button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-8 right-0 z-30 w-80 rounded-xl border p-2 shadow-lg">
          <p className="kicker px-2 pb-1">Versions</p>
          <ul className="max-h-80 overflow-y-auto">
            {versions.map((v, i) => (
              <li key={v.hash} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{v.subject}</div>
                  <div className="text-muted-foreground font-mono">
                    {v.hash} · {new Date(v.at).toLocaleString()}
                  </div>
                </div>
                {i === 0 ? (
                  <span className="text-muted-foreground shrink-0">live</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-xs"
                    onClick={() => {
                      setOpen(false);
                      void call(() => api.apps({ appId }).restore.post({ version: v.hash })).catch(
                        reportError,
                      );
                    }}
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type DataInfo = { store: "database" | "files"; collections: { name: string; count: number }[] };

/** Where the app keeps its data and what it holds (ADR 0024, phase 24): never Aura's database. */
function DataMenu({ appId }: { appId: string }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<DataInfo | null>(null);
  const [confirm, setConfirm] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(
    () =>
      call(() => api.apps({ appId }).data.get())
        .then((d) => setInfo(d as DataInfo))
        .catch(reportError),
    [appId],
  );
  useEffect(() => {
    if (!open) return;
    void load();
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, load]);

  const move = (store: DataInfo["store"]) =>
    call(() => api.apps({ appId }).data.store.put({ store }))
      .then((d) => setInfo(d as DataInfo))
      .catch(reportError);
  const exportData = async () => {
    try {
      const data = await call(() => api.apps({ appId }).data.export.get());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${appId}-data.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <div className="relative" ref={box}>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Data"
        title="The app's data: where it is kept, export, delete"
        onClick={() => setOpen(!open)}
      >
        <Database />
      </Button>
      {open && info && (
        <div className="bg-popover text-popover-foreground absolute top-8 right-0 z-30 w-72 rounded-xl border p-3 text-sm shadow-lg">
          <p className="kicker mb-1">Kept in</p>
          <div className="mb-2 flex gap-1 text-xs">
            {(
              [
                ["database", "Its own database"],
                ["files", "Files in its folder"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={info.store === key}
                onClick={() => void move(key)}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1",
                  info.store === key ? "border-primary bg-primary/10" : "hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground mb-2 text-xs">
            {info.store === "files"
              ? `JSON files in ~/.aura/projects/${appId}/data, easy to read and copy.`
              : "A database of its own, apart from Aura's."}{" "}
            Switching moves the data.
          </p>
          <ul className="mb-3 text-xs">
            {info.collections.length === 0 && (
              <li className="text-muted-foreground">No data yet.</li>
            )}
            {info.collections.map((c) => (
              <li key={c.name} className="flex justify-between">
                <span className="font-mono">{c.name}</span>
                <span>{c.count}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void exportData()}>
              Export
            </Button>
            {confirm ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setConfirm(false);
                  void call(() => api.apps({ appId }).data.delete())
                    .then(load)
                    .catch(reportError);
                }}
              >
                Delete all its data?
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                Delete data
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type SecretState = { name: string; set: boolean };

/**
 * An app's own secrets (ADR 0030): the names its manifest uses, set or cleared here. Values go to
 * the server only; nobody (not the app, not other apps, not agents) can read them back.
 */
export function AppSecretsMenu({ appId }: { appId: string }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<SecretState[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    call(() => api.extensions({ extensionId: appId }).secrets.get())
      .then((l) => setList(l as SecretState[]))
      .catch(reportError);
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, appId]);
  const save = (name: string, value: string | null) =>
    call(() => api.extensions({ extensionId: appId }).secrets({ name }).put({ value }))
      .then((l) => {
        setList(l as SecretState[]);
        setDrafts((d) => ({ ...d, [name]: "" }));
      })
      .catch(reportError);
  return (
    <div className="relative" ref={box}>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Secrets"
        title="The app's secrets: keys it puts into its requests; only it can use them"
        onClick={() => setOpen(!open)}
      >
        <KeyRound />
      </Button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-8 right-0 z-30 w-80 rounded-xl border p-3 text-sm shadow-lg">
          <p className="kicker mb-1">Secrets</p>
          <p className="text-muted-foreground mb-2 text-xs">
            Only this app can use them, in requests to its approved hosts. Values are never shown.
          </p>
          <ul className="grid gap-2">
            {list.map((s) => (
              <li key={s.name} className="grid gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{s.name}</span>
                  <span className={cn("text-xs", s.set ? "text-emerald-600" : "text-amber-600")}>
                    {s.set ? "set" : "no value"}
                  </span>
                </div>
                <div className="flex gap-1">
                  <input
                    type="password"
                    aria-label={`Value of ${s.name}`}
                    placeholder={s.set ? "New value" : "Value"}
                    value={drafts[s.name] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.name]: e.target.value }))}
                    className="bg-background min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-7"
                    disabled={!drafts[s.name]}
                    onClick={() => void save(s.name, drafts[s.name] ?? "")}
                  >
                    Save
                  </Button>
                  {s.set && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => void save(s.name, null)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

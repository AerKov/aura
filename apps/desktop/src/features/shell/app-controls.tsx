import type { ExtensionInfo } from "@aura/shared";
import { Database, History, KeyRound, MessageSquare, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { setState, useChatStore } from "@/features/chat/store";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAdvanced } from "./launcher";

type Version = { hash: string; author: string; at: string; subject: string };

/**
 * The bar of an app built in Aura (ADR 0024): its chat (a panel inside the tile, ADR 0027), a
 * preview of changes waiting for approval, and its versions. `chat`: whether chats are on.
 */
export function AppControls({ ext, chat }: { ext: ExtensionInfo; chat: boolean }) {
  const t = useT();
  const advanced = useAdvanced();
  const preview = useChatStore((s) => s.previewDraft[ext.id] ?? false);
  const chatOpen = useChatStore((s) => s.appChat[ext.id] ?? false);
  const app = ext.app;
  if (!app) return null;
  const show = (draft: boolean) =>
    setState((s) => ({ previewDraft: { ...s.previewDraft, [ext.id]: draft } }));
  return (
    <>
      {app.draft && (
        // "Now / After the change" (ADR 0034): the live app or the change waiting for a "Yes".
        <div className="flex border text-xs @max-[520px]:hidden">
          <button
            type="button"
            aria-pressed={!preview}
            onClick={() => show(false)}
            className={cn(
              "px-2 py-1 transition-colors",
              !preview ? "bg-primary text-primary-foreground" : "hover:bg-foreground/[0.07]",
            )}
          >
            {t("Now")}
          </button>
          <button
            type="button"
            aria-pressed={preview}
            title={t("Shows the change that waits for your decision")}
            onClick={() => show(true)}
            className={cn(
              "border-l px-2 py-1 transition-colors",
              preview ? "bg-primary text-primary-foreground" : "hover:bg-foreground/[0.07]",
            )}
          >
            {t("After the change")}
          </button>
        </div>
      )}
      {app.draft && advanced && (
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground size-7"
          aria-label={t("Discard the change that waits for your decision")}
          title={t("Discard the change that waits for your decision")}
          onClick={() => {
            show(false);
            void call(() => api.apps({ appId: ext.id }).discard.post()).catch(reportError);
          }}
        >
          <Trash2 strokeWidth={1.5} />
        </Button>
      )}
      <Versions appId={ext.id} />
      {advanced && <DataMenu appId={ext.id} />}
      {ext.secrets.length > 0 && <AppSecretsMenu appId={ext.id} />}
      {chat && (
        <Button
          size="sm"
          variant={chatOpen ? "secondary" : "ghost"}
          className={cn("h-7 gap-1 px-2 text-xs", chatOpen && "border-ring")}
          aria-pressed={chatOpen}
          title={t("The app's chat: use it and change it by asking")}
          onClick={() => setAppChat(ext.id, !chatOpen)}
        >
          <MessageSquare strokeWidth={1.5} /> {t("Chat")}
        </Button>
      )}
    </>
  );
}

/** Opens or closes an app's chat panel inside its tile. */
export function setAppChat(appId: string, open: boolean): void {
  setState((s) => ({ appChat: { ...s.appChat, [appId]: open } }));
}

export function Versions({ appId }: { appId: string }) {
  const t = useT();
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
        className="text-muted-foreground hover:text-foreground size-7"
        aria-label={t("History of changes")}
        title={t("History of changes")}
        onClick={() => setOpen(!open)}
      >
        <History strokeWidth={1.5} />
      </Button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-8 right-0 z-30 w-80 border p-2 shadow-md">
          <p className="text-muted-foreground px-2 pb-1 text-xs font-medium">
            {t("History of changes")}
          </p>
          <ul className="max-h-80 overflow-y-auto">
            {versions.map((v, i) => (
              <li key={v.hash} className="flex items-start gap-2 px-2 py-1.5 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{v.subject}</div>
                  <div className="text-muted-foreground font-mono text-[11px]">
                    {new Date(v.at).toLocaleString()}
                  </div>
                </div>
                {i === 0 ? (
                  <span className="text-muted-foreground shrink-0 text-xs">{t("now")}</span>
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
                    {t("Bring back")}
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
  const t = useT();
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
        aria-label={t("Secrets")}
        title={t("The app's secrets: keys it puts into its requests; only it can use them")}
        onClick={() => setOpen(!open)}
      >
        <KeyRound />
      </Button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-8 right-0 z-30 w-80 rounded-xl border p-3 text-sm shadow-lg">
          <p className="kicker mb-1">{t("Secrets")}</p>
          <p className="text-muted-foreground mb-2 text-xs">
            {t(
              "Only this app can use them, in requests to its approved hosts. Values are never shown.",
            )}
          </p>
          <ul className="grid gap-2">
            {list.map((s) => (
              <li key={s.name} className="grid gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{s.name}</span>
                  <span className={cn("text-xs", s.set ? "text-emerald-600" : "text-amber-600")}>
                    {s.set ? t("set") : t("no value")}
                  </span>
                </div>
                <div className="flex gap-1">
                  <input
                    type="password"
                    aria-label={t("Value of {name}", { name: s.name })}
                    placeholder={s.set ? t("New value") : t("Value")}
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
                    {t("Save")}
                  </Button>
                  {s.set && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => void save(s.name, null)}
                    >
                      {t("Clear")}
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

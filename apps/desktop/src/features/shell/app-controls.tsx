import type { ExtensionInfo } from "@aura/shared";
import { Eye, EyeOff, History, MessagesSquare, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { openChat, reportError } from "@/features/chat/actions";
import { setState, useChatStore } from "@/features/chat/store";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

type Version = { hash: string; author: string; at: string; subject: string };

/**
 * The bar of an app built in Aura (ADR 0024): its chat, a preview of changes waiting for approval,
 * and its versions.
 */
export function AppControls({ ext }: { ext: ExtensionInfo }) {
  const preview = useChatStore((s) => s.previewDraft[ext.id] ?? false);
  const app = ext.app;
  if (!app) return null;
  const togglePreview = () =>
    setState((s) => ({ previewDraft: { ...s.previewDraft, [ext.id]: !preview } }));
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs"
        title="The app's chat: use it and change it with @builder"
        onClick={() => openChat(app.chatId)}
      >
        <MessagesSquare /> Chat
      </Button>
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
      <Versions appId={ext.id} />
    </>
  );
}

function Versions({ appId }: { appId: string }) {
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

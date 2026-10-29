import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { reportError } from "./actions";
import { removeChat } from "./store";

/**
 * Deletes a group or a project's chat (ADR 0035) after a clear question. A project's files are
 * not deleted: they move to the backups folder. The chat's reminders go with it.
 */
export function DeleteChatButton({ chatId, project }: { chatId: string; project: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await call(() => api.chats({ chatId }).delete());
      removeChat(chatId);
    } catch (err) {
      reportError(err);
      setError(err instanceof Error ? err.message : t("Could not delete the chat"));
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={box}>
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={open}
        title={t("Delete this chat")}
        onClick={() => setOpen(!open)}
      >
        <Trash2 /> <span className="max-md:sr-only">{t("Delete")}</span>
      </Button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-9 right-0 z-30 grid w-72 gap-2 border p-3 shadow-md">
          <p className="text-sm font-medium">{t("Delete this chat?")}</p>
          <p className="text-muted-foreground text-[13px]">
            {project
              ? t(
                  "The messages and the project are removed. Its files are kept in the backups folder.",
                )
              : t("The messages are deleted for good.")}
          </p>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove()}>
              {t("Yes, delete")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              {t("No, keep it")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

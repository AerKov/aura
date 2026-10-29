import { Check, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { reportError } from "./actions";
import { setState, useChatStore } from "./store";

/**
 * "+ Helper" (ADR 0034): who works in this project's or app's chat, and a click to add or remove
 * one. Each change posts a line in the chat.
 */
export function TeamButton({ chatId }: { chatId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const agents = useChatStore((s) => s.agents);
  const members = useChatStore((s) => s.members[chatId]);
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

  const inChat = new Set((members ?? []).filter((m) => m.kind === "agent").map((m) => m.id));
  const toggle = async (handle: string) => {
    setBusy(handle);
    try {
      const agent = api.chats({ chatId }).agents({ handle });
      const list = await call(() => (inChat.has(handle) ? agent.delete() : agent.put()));
      setState((s) => ({
        members: { ...s.members, [chatId]: list.map((m) => m.participant) },
      }));
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative" ref={box}>
      <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        <UserPlus /> <span className="max-sm:sr-only">{t("Helper")}</span>
      </Button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-9 right-0 z-30 w-72 border p-1.5 shadow-md">
          {Object.values(agents)
            .filter((a) => a.handle !== "orchestrator")
            .map((a) => {
              const on = inChat.has(a.handle);
              return (
                <button
                  key={a.handle}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void toggle(a.handle)}
                  className="hover:bg-foreground/[0.06] flex w-full items-center gap-2.5 px-2 py-1.5 text-left"
                >
                  <Mark name={a.handle} size="sm" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">{a.role}</span>
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-xs",
                      on ? "text-foreground" : "text-signal-text",
                    )}
                  >
                    {on ? (
                      <>
                        <Check className="size-3.5" /> {t("working")}
                      </>
                    ) : (
                      t("add")
                    )}
                  </span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

import { Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { openChat, reportError } from "./actions";
import { upsertChat, useChatStore } from "./store";

/**
 * "New group" (ADR 0035): a chat of the user's own with a name and the helpers they choose. The
 * Helper is always in it; more helpers can be added or removed later with "+ Helper".
 */
export function NewGroupButton() {
  const t = useT();
  const agents = useChatStore((s) => s.agents);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
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

  const choices = Object.values(agents).filter((a) => a.handle !== "orchestrator");
  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const chat = await call(() => api.chats.post({ title, agents: chosen }));
      upsertChat(chat);
      openChat(chat.id);
      setOpen(false);
      setTitle("");
      setChosen([]);
    } catch (err) {
      reportError(err);
      setError(err instanceof Error ? err.message : t("Could not create the group"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative border-b" ref={box}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-signal-text hover:bg-foreground/[0.05] flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13.5px] font-medium"
      >
        <Plus className="size-4" /> {t("New group")}
      </button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-full right-2 left-2 z-30 grid gap-2 border p-3 shadow-md">
          <label htmlFor="new-group-name" className="text-muted-foreground text-[12.5px]">
            {t("Name of the group")}
          </label>
          <input
            id="new-group-name"
            // biome-ignore lint/a11y/noAutofocus: the popover opens to type a name
            autoFocus
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            placeholder={t("e.g. Planning")}
            className="bg-input-bg border-input focus:border-ring border px-2.5 py-1.5 text-sm outline-none"
          />
          {choices.length > 0 && (
            <>
              <span className="text-muted-foreground text-[12.5px]">
                {t("Who is in it (the Helper always is)")}
              </span>
              <div className="max-h-48 overflow-y-auto">
                {choices.map((a) => {
                  const on = chosen.includes(a.handle);
                  return (
                    <button
                      key={a.handle}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setChosen(on ? chosen.filter((h) => h !== a.handle) : [...chosen, a.handle])
                      }
                      className="hover:bg-foreground/[0.06] flex w-full items-center gap-2.5 px-2 py-1.5 text-left"
                    >
                      <Mark name={a.handle} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                      <Check className={cn("size-4", on ? "text-foreground" : "invisible")} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {error && <p className="text-destructive text-xs">{error}</p>}
          <Button size="sm" disabled={!title.trim() || busy} onClick={() => void create()}>
            {t("Create")}
          </Button>
        </div>
      )}
    </div>
  );
}

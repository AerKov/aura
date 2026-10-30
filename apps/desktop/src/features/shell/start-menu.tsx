import { Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/switch";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { setState, useChatStore } from "@/features/chat/store";
import { useT } from "@/features/localization/i18n";
import { cn } from "@/lib/utils";
import { openEntry } from "./apps";
import { closeMenus, type Entry, useLauncher } from "./launcher";

const WELCOMED_KEY = "aura.menu.welcomed";

function wasWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED_KEY) === "1";
  } catch {
    return false;
  }
}

/** One app row: icon box, name, one line of description, a dot when it is on screen. */
export function AppRow({
  entry,
  highlighted = false,
  onOpen,
}: {
  entry: Entry;
  highlighted?: boolean;
  onOpen: (shift: boolean) => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.shiftKey)}
      className={cn(
        "flex min-w-0 items-center gap-2.5 px-2 py-1.5 text-left transition-colors duration-150 hover:bg-foreground/[0.06]",
        highlighted && "outline-ring outline-2 -outline-offset-2",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center border">
        <Icon className="size-[18px]" strokeWidth={1.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium">{entry.name}</span>
        <span className="text-muted-foreground truncate text-xs">{entry.description ?? ""}</span>
      </span>
      {entry.open && <span className="bg-signal size-1.5 shrink-0 rounded-full" />}
    </button>
  );
}

/**
 * "My apps" (ADR 0034): the Start menu next to the bar. It lists every app by group over the
 * work, which stays on screen; Enter opens the first match, Esc closes it.
 */
export function StartMenu() {
  const t = useT();
  const open = useChatStore((s) => s.menuOpen);
  const [query, setQuery] = useState("");
  const [welcomed, setWelcomed] = useState(wasWelcomed);
  const groups = useLauncher(query);
  const search = useRef<HTMLInputElement>(null);
  const first = groups[0]?.entries[0];

  useEffect(() => {
    if (!open) return;
    setQuery("");
    search.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const launch = (entry: Entry, shift: boolean) => {
    closeMenus();
    openEntry(entry.key, entry.app, shift ? "right" : "here");
  };
  const dismiss = () => {
    setWelcomed(true);
    try {
      localStorage.setItem(WELCOMED_KEY, "1");
    } catch {
      // A private window: the card comes back next time.
    }
  };
  const steps = [
    [t("Open an app"), t("Click it here or on the bar. You can open two side by side.")],
    [
      t("Write in its chat"),
      t(
        "Every app has a Chat button. Tell the AI helper in plain words: “add a phone column”, “make a monthly report”.",
      ),
    ],
    [
      t("Approve the change"),
      t(
        "The helper shows exactly what will change. Nothing changes without your “Yes”, and any version can come back.",
      ),
    ],
  ];

  return (
    <div className="absolute inset-0 z-40 flex">
      <aside
        aria-label={t("My apps")}
        className="bg-popover text-popover-foreground flex h-full w-[min(480px,100%)] flex-col border-r shadow-md"
      >
        <div className="flex flex-col gap-3 border-b px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <h2 className="mr-auto text-2xl">{t("My apps")}</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setState(() => ({ menuOpen: false, addOpen: true }))}
            >
              <Plus /> {t("New app")}
            </Button>
          </div>
          <label className="bg-input-bg focus-within:border-ring flex h-9 items-center gap-2 border border-input px-2.5">
            <Search className="text-muted-foreground size-4" />
            <input
              ref={search}
              type="search"
              value={query}
              aria-label={t("Find an app or a setting")}
              placeholder={t("Find an app or a setting")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && first) launch(first, e.shiftKey);
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3.5">
          {!welcomed && !query && (
            <div className="border-ring flex flex-col gap-2 border px-3.5 py-3">
              <span className="text-[15px] font-medium">{t("How it all works")}</span>
              {steps.map(([title, text], i) => (
                <div
                  key={title}
                  className="grid grid-cols-[18px_1fr] gap-2 text-[13px] leading-snug"
                >
                  <span className="text-signal-text font-mono">{i + 1}</span>
                  <span>
                    <b className="font-medium">{title}.</b>{" "}
                    <span className="text-muted-foreground">{text}</span>
                  </span>
                </div>
              ))}
              <Button size="sm" variant="outline" className="self-start" onClick={dismiss}>
                {t("Got it")}
              </Button>
            </div>
          )}
          {groups.map(({ group, entries }) => (
            <div key={group} className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[12.5px] font-medium">{group}</span>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-0.5">
                {entries.map((entry) => (
                  <AppRow
                    key={entry.key}
                    entry={entry}
                    highlighted={query !== "" && entry === first}
                    onOpen={(shift) => launch(entry, shift)}
                  />
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {t("Nothing found.")}{" "}
              <button
                type="button"
                className="text-signal-text underline underline-offset-2"
                onClick={() => setState(() => ({ menuOpen: false, addOpen: true }))}
              >
                {t("Make such an app?")}
              </button>
            </p>
          )}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-3.5 border-t px-4 py-2.5 text-xs">
          <span className="ml-auto">{t("Enter: open · Esc: close")}</span>
        </div>
      </aside>
      <button
        type="button"
        aria-label={t("Close")}
        tabIndex={-1}
        className="bg-background/45 flex-1"
        onClick={closeMenus}
      />
    </div>
  );
}

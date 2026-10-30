import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { setState } from "@/features/chat/store";
import { useT } from "@/features/localization/i18n";
import { AppMenu } from "./app-menu";
import { openEntry } from "./apps";
import { type Entry, useLauncher } from "./launcher";
import { AppRow } from "./start-menu";

/**
 * "New window" (ADR 0027, ADR 0034): an empty tile shows every app by group, like the "My apps"
 * menu. The user's apps have a menu to uninstall them.
 */
export function HomeView() {
  const t = useT();
  const [query, setQuery] = useState("");
  const groups = useLauncher(query);
  const first = groups[0]?.entries[0];
  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-2xl">{t("New window")}</h1>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setState(() => ({ addOpen: true, menuOpen: false }))}
          >
            <Plus /> {t("New app")}
          </Button>
        </header>
        <label className="bg-input-bg focus-within:border-ring border-input flex h-9 items-center gap-2 border px-2.5">
          <Search className="text-muted-foreground size-4" />
          <input
            type="search"
            value={query}
            aria-label={t("Find an app or a setting")}
            placeholder={t("Find an app or a setting")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && first) openEntry(first.key, first.app);
            }}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        {groups.map(({ group, entries }) => (
          <div key={group} className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[12.5px] font-medium">{group}</span>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-0.5">
              {entries.map((entry) => (
                <div key={entry.key} className="group relative flex items-center">
                  <div className="min-w-0 flex-1 [&>button]:w-full">
                    <AppRow
                      entry={entry}
                      onOpen={(shift) => openEntry(entry.key, entry.app, shift ? "right" : "here")}
                    />
                  </div>
                  <EntryControl entry={entry} />
                </div>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-muted-foreground text-sm">{t("Nothing found.")}</p>
        )}
      </div>
    </section>
  );
}

/** The user's apps have their menu (uninstall); built-in apps have none. */
function EntryControl({ entry }: { entry: Entry }) {
  if (entry.extension) return <AppMenu extension={entry.extension} />;
  return null;
}

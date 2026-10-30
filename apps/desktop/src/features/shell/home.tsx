import { MODULES, type ModuleId, switchModule } from "@aura/shared";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/switch";
import { Button } from "@/components/ui/button";
import { loadInitial } from "@/features/chat/actions";
import { setState } from "@/features/chat/store";
import { loadCustomize } from "@/features/customize/customize-view";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { AppMenu } from "./app-menu";
import { openEntry, useModules } from "./apps";
import { type Entry, useAdvanced, useLauncher } from "./launcher";
import { AppRow } from "./start-menu";

/** The launcher entry that turns each module on and off; the others only follow it. */
const MODULE_SWITCH: Record<ModuleId, string> = {
  chats: "chats",
  skills: "skills",
  memory: "memory",
  jobs: "schedule",
  alerts: "signals",
};

/**
 * "New window" (ADR 0027, ADR 0034): an empty tile shows every app by group, like the "My apps"
 * menu. The user's apps have a menu to uninstall them; in advanced mode built-in apps have their
 * switch.
 */
export function HomeView() {
  const t = useT();
  const [query, setQuery] = useState("");
  const groups = useLauncher(query);
  const advanced = useAdvanced();
  const first = groups[0]?.entries.find((e) => !e.off);
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
                      onOpen={(shift) =>
                        !entry.off && openEntry(entry.key, entry.app, shift ? "right" : "here")
                      }
                    />
                  </div>
                  <EntryControl entry={entry} advanced={advanced} />
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

/** The user's apps always have their menu; built-in apps' switches are for advanced mode. */
function EntryControl({ entry, advanced }: { entry: Entry; advanced: boolean }) {
  if (entry.extension) return <AppMenu extension={entry.extension} />;
  return null;
}

/** A built-in module's switch: turning it off also turns off what needs it, after a confirm. */
export function ModuleSwitch({ id }: { id: ModuleId }) {
  const modules = useModules();
  const t = useT();
  const [confirm, setConfirm] = useState<ModuleId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = t(MODULES[id].name);
  const on = modules[id];

  const toggle = async (enabled: boolean) => {
    setError(null);
    setConfirm(null);
    try {
      await call(() => api.modules({ moduleId: id }).put({ enabled }));
      await loadCustomize();
      if (id === "chats" && enabled) await loadInitial();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const ask = () => {
    if (!on) return void toggle(true);
    const also = switchModule(modules, id, false).changed.filter((m) => m !== id);
    if (also.length === 0) return void toggle(false);
    setConfirm(also);
  };

  return (
    <div className="relative px-2">
      <Switch
        checked={on}
        label={on ? t("Turn off {name}", { name }) : t("Turn on {name}", { name })}
        onChange={ask}
      />
      {(confirm || error) && (
        <div className="bg-popover absolute top-7 right-0 z-10 w-64 border p-3 text-xs shadow-md">
          {error ? (
            <p className="text-destructive">{error}</p>
          ) : (
            <>
              <p className="mb-2">
                {t("Also turns off {list}.", {
                  list: (confirm ?? []).map((m) => t(MODULES[m].name)).join(", "),
                })}
              </p>
              <div className="flex gap-1.5">
                <Button size="sm" variant="destructive" onClick={() => void toggle(false)}>
                  {t("Turn off")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  {t("Cancel")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

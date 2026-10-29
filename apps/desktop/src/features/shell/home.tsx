import {
  type AppRef,
  BUILTIN_APPS,
  BUILTIN_GROUPS,
  type BuiltinApp,
  DEFAULT_APP_GROUP,
  type ExtensionInfo,
  groupOrder,
  MODULES,
  type ModuleId,
  matchesSearch,
  type PackSummary,
  switchModule,
} from "@aura/shared";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadInitial, loadProjects, reportError } from "@/features/chat/actions";
import { loadCustomize } from "@/features/customize/customize-view";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { setAppChat } from "./app-controls";
import { AppMenu } from "./app-menu";
import { appInfo, useExtensionApps, useModules } from "./apps";
import { openAppRef } from "./layout";

const ONBOARDING_KEY = "aura.home.welcomed";

/** The launcher entry that turns each module on and off; the others only follow it. */
const MODULE_SWITCH: Record<ModuleId, string> = {
  chats: "chats",
  skills: "skills",
  memory: "memory",
  jobs: "schedule",
  alerts: "signals",
};

function wasWelcomed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return false;
  }
}

/** Click: open in this tile. Shift-click: in a new tile to the right. */
function open(app: AppRef, shift: boolean): void {
  openAppRef(app, shift ? "right" : "here");
}

/** One launcher entry: an app you made or installed, or a built-in one. */
interface Entry {
  key: string;
  app: AppRef;
  name: string;
  description: string | null;
  group: string;
  icon: LucideIcon;
  builtin: BuiltinApp | null;
  extension: ExtensionInfo | null;
}

function entries(extensions: ExtensionInfo[], t: (text: string) => string): Entry[] {
  return [
    ...extensions.map((ext) => ({
      key: `ext:${ext.id}`,
      app: `ext:${ext.id}` as AppRef,
      name: ext.name,
      description: ext.description,
      group: ext.group ?? t(DEFAULT_APP_GROUP),
      icon: extensionIcon(ext.icon),
      builtin: null,
      extension: ext,
    })),
    ...BUILTIN_APPS.map((b) => ({
      key: b.key,
      app: b.app,
      name: t(b.name),
      description: t(b.description),
      group: t(b.group),
      icon: appInfo(b.app, []).icon,
      builtin: b,
      extension: null,
    })),
  ];
}

/**
 * The launcher (ADR 0027, ADR 0033): Aura is a shell you fill with apps. Every app, yours and the
 * built-in ones, is listed by group with what it is for; search finds one by name, description or
 * group. Built-in apps can be turned off; yours can be uninstalled with a backup.
 */
export function HomeView() {
  const extensions = useExtensionApps();
  const modules = useModules();
  const [welcomed, setWelcomed] = useState(wasWelcomed);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const t = useT();
  const all = useMemo(() => entries(extensions, t), [extensions, t]);
  const shown = all.filter((e) => matchesSearch(e, query));
  const groups = groupOrder(
    shown.map((e) => e.group),
    BUILTIN_GROUPS.map((g) => t(g)),
    t(DEFAULT_APP_GROUP),
  );
  const dismiss = () => {
    setWelcomed(true);
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      // A private window: the card comes back next time.
    }
  };
  const first = shown.find((e) => !e.builtin?.module || modules[e.builtin.module]);
  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <LayoutGrid className="text-primary size-7" />
          <h1 className="mr-auto text-[28px] leading-tight font-semibold tracking-tight">
            {t("Your apps")}
          </h1>
          <label className="bg-card focus-within:border-primary flex w-64 items-center gap-2 rounded-full border px-3 py-1.5 max-sm:w-full">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              type="search"
              aria-label={t("Find an app")}
              placeholder={t("Find an app")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && first) open(first.app, e.shiftKey);
                if (e.key === "Escape") setQuery("");
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <Button
            size="sm"
            className="rounded-full"
            aria-expanded={adding}
            onClick={() => setAdding(!adding)}
          >
            <Plus /> {t("Add an app")}
          </Button>
        </header>

        {!welcomed && (
          <div className="bg-card relative mb-8 rounded-2xl border p-5 text-sm">
            <button
              type="button"
              aria-label={t("Hide")}
              onClick={dismiss}
              className="text-muted-foreground hover:bg-accent absolute top-3 right-3 rounded p-1"
            >
              <X className="size-4" />
            </button>
            <p className="mb-2 font-medium">{t("Welcome to Aura")}</p>
            <p className="text-muted-foreground max-w-2xl">
              {t(
                "Aura is a shell for your apps. Add one from a template or the catalog, or build your own by describing it to AI agents in its chat. Even the built-in parts (chats, skills, memory) are apps: turn off what you do not need. Click an app to open it here; Shift-click opens it beside.",
              )}
            </p>
          </div>
        )}

        {adding && <NewApp chats={modules.chats} onDone={() => setAdding(false)} />}

        {groups.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {t("No app matches “{query}”.", { query: query.trim() })}
          </p>
        )}
        {groups.map((group) => (
          <div key={group} className="mb-8">
            <h2 className="kicker mb-3">{group}</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {shown
                .filter((e) => e.group === group)
                .map((entry) => (
                  <AppCard key={entry.key} entry={entry} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AppCard({ entry }: { entry: Entry }) {
  const modules = useModules();
  const t = useT();
  const module = entry.builtin?.module ?? null;
  const on = module === null || modules[module];
  const Icon = entry.icon;
  return (
    <div
      className={cn(
        "bg-card hover:border-primary/60 group relative flex flex-col rounded-2xl border transition-colors",
        !on && "opacity-70",
      )}
    >
      <button
        type="button"
        disabled={!on}
        onClick={(e) => open(entry.app, e.shiftKey)}
        className="flex flex-1 items-start gap-3 rounded-2xl p-4 pr-12 text-left disabled:cursor-default"
      >
        <Icon
          className={cn("mt-0.5 size-6 shrink-0", on ? "text-primary" : "text-muted-foreground")}
        />
        <span className="min-w-0">
          <span className="block font-medium">{entry.name}</span>
          <span className="text-muted-foreground line-clamp-2 text-xs">
            {entry.description ?? t("No description yet. Ask in its chat to add one.")}
          </span>
        </span>
      </button>
      <div className="absolute top-3 right-3">
        {module && MODULE_SWITCH[module] === entry.key ? (
          <ModuleSwitch id={module} />
        ) : entry.extension ? (
          <AppMenu extension={entry.extension} />
        ) : null}
      </div>
      {!on && module && MODULE_SWITCH[module] !== entry.key && (
        <p className="text-muted-foreground px-4 pb-3 text-[11px]">
          {t("Off with {name}.", { name: t(MODULES[module].name) })}
        </p>
      )}
    </div>
  );
}

/** A built-in module's switch: turning it off also turns off what needs it, after a confirm. */
function ModuleSwitch({ id }: { id: ModuleId }) {
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
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={on ? t("Turn off {name}", { name }) : t("Turn on {name}", { name })}
        title={on ? t("Turn off {name}", { name }) : t("Turn on {name}", { name })}
        onClick={ask}
        className={cn(
          "relative block h-5 w-8 shrink-0 rounded-full transition-colors",
          on ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "bg-background absolute top-0.5 size-4 rounded-full shadow transition-all",
            on ? "left-[14px]" : "left-0.5",
          )}
        />
      </button>
      {(confirm || error) && (
        <div className="bg-popover absolute top-7 right-0 z-10 w-60 rounded-xl border p-3 text-xs shadow-lg">
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
    </>
  );
}

/**
 * A new app (ADR 0024): from a template in the catalog (phase 26), or empty, made by @builder in
 * its chat, which needs Chats. It opens right away; an empty one with its chat panel open.
 */
function NewApp({ chats, onDone }: { chats: boolean; onDone: () => void }) {
  const [templates, setTemplates] = useState<PackSummary[]>([]);
  const [template, setTemplate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();
  useEffect(() => {
    call(() => api.catalog.get())
      .then((packs) => {
        const apps = packs.filter((p) => p.contents.apps.length === 1 && !p.installed);
        setTemplates(apps);
        if (!chats) setTemplate((t) => t ?? apps[0]?.id ?? null);
      })
      .catch(reportError);
  }, [chats]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      let appId: string;
      const pack = templates.find((p) => p.id === template);
      if (pack) {
        const preview = await call(() => api.catalog.preview.post({ id: pack.id }));
        await call(() => api.catalog.install.post({ id: pack.id, sha256: preview.sha256 }));
        appId = pack.contents.apps[0] ?? "";
      } else {
        appId = (
          await call(() =>
            api.apps.post({ name: name.trim(), description: description.trim() || undefined }),
          )
        ).id;
        setAppChat(appId, true);
      }
      // The new app and its chat may not have arrived over the socket yet.
      await loadCustomize();
      if (chats) await Promise.all([loadProjects(), loadInitial()]);
      onDone();
      openAppRef(`ext:${appId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const choices = [
    ...(chats ? [{ id: null, name: t("Empty") }] : []),
    ...templates.map((p) => ({ id: p.id as string | null, name: p.name })),
  ];
  return (
    <div className="bg-card mb-10 grid max-w-xl gap-2 rounded-2xl border p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <LayoutGrid className="size-4" /> {t("New app")}
      </p>
      <div className="flex flex-wrap gap-1 text-xs">
        {choices.map((t) => (
          <button
            key={t.id ?? "empty"}
            type="button"
            aria-pressed={template === t.id}
            onClick={() => setTemplate(t.id)}
            className={cn(
              "rounded-full border px-2.5 py-1",
              template === t.id ? "border-primary bg-primary/10" : "hover:bg-accent",
            )}
          >
            {t.name}
          </button>
        ))}
      </div>
      {template ? (
        <p className="text-muted-foreground text-xs">
          {templates.find((p) => p.id === template)?.description}
        </p>
      ) : chats ? (
        <>
          <input
            aria-label={t("App name")}
            placeholder={t("Name, e.g. Clients")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-background rounded-lg border px-2 py-1 text-sm"
          />
          <textarea
            aria-label={t("What it should do")}
            placeholder={t("What it should do (optional: you can tell @builder in its chat)")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-background resize-none rounded-lg border px-2 py-1 text-sm"
          />
        </>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("No templates left to add. Turn on Chats to build your own app with agents.")}
        </p>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || (!template && (!chats || !name.trim()))}
          onClick={() => void create()}
        >
          {t("Create")}
        </Button>
        <Button size="sm" variant="ghost" onClick={(e) => open("page:catalog", e.shiftKey)}>
          {t("Browse the catalog")}
        </Button>
      </div>
    </div>
  );
}

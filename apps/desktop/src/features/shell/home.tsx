import {
  type AppRef,
  MODULE_IDS,
  MODULES,
  type ModuleId,
  type PackSummary,
  switchModule,
} from "@aura/shared";
import { LayoutGrid, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadInitial, loadProjects, reportError } from "@/features/chat/actions";
import { loadCustomize } from "@/features/customize/customize-view";
import { api, call } from "@/lib/api";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { setAppChat } from "./app-controls";
import { appInfo, useExtensionApps, useModules } from "./apps";
import { openAppRef } from "./layout";

const ONBOARDING_KEY = "aura.home.welcomed";

/** The app each built-in module opens; Signals live in the messenger's system chat. */
const MODULE_APP: Record<ModuleId, AppRef> = {
  chats: "messenger",
  skills: "page:skills",
  memory: "page:memory",
  jobs: "page:jobs",
  alerts: "messenger",
  integrations: "page:integrations",
};

/** The core's own apps: always there. */
const CORE_APPS: AppRef[] = ["page:catalog", "page:customize", "page:devices"];

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

/**
 * The home shelf (ADR 0027): Aura is a core you fill with apps. It lists your apps, the built-in
 * ones (each can be turned off) and a way to add more.
 */
export function HomeView() {
  const extensions = useExtensionApps();
  const modules = useModules();
  const [welcomed, setWelcomed] = useState(wasWelcomed);
  const [adding, setAdding] = useState(false);
  const dismiss = () => {
    setWelcomed(true);
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      // A private window: the card comes back next time.
    }
  };
  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center gap-3">
          <LayoutGrid className="text-primary size-7" />
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Your apps</h1>
        </header>

        {!welcomed && (
          <div className="bg-card relative mb-8 rounded-2xl border p-5 text-sm">
            <button
              type="button"
              aria-label="Hide"
              onClick={dismiss}
              className="text-muted-foreground hover:bg-accent absolute top-3 right-3 rounded p-1"
            >
              <X className="size-4" />
            </button>
            <p className="mb-2 font-medium">Welcome to Aura</p>
            <p className="text-muted-foreground max-w-2xl">
              Aura is an empty shelf for your apps. Add one from a template or the catalog, or build
              your own by describing it to AI agents in its chat. Even the built-in parts (chats,
              skills, memory) are apps: turn off what you do not need. Click an app to open it here;
              Shift-click opens it beside.
            </p>
          </div>
        )}

        <div className="mb-10 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {extensions.map((ext) => {
            const Icon = extensionIcon(ext.icon);
            return (
              <button
                key={ext.id}
                type="button"
                onClick={(e) => open(`ext:${ext.id}`, e.shiftKey)}
                className="bg-card hover:border-primary/60 flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors"
              >
                <Icon className="text-primary size-6" />
                <span className="font-medium">{ext.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-expanded={adding}
            onClick={() => setAdding(!adding)}
            className={cn(
              "text-muted-foreground hover:text-foreground flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-sm",
              adding && "border-primary text-foreground",
            )}
          >
            <Plus className="size-6" /> Add an app
          </button>
        </div>
        {adding && <NewApp chats={modules.chats} onDone={() => setAdding(false)} />}

        <h2 className="kicker mb-3">Built in</h2>
        <div className="mb-8 grid gap-2">
          {MODULE_IDS.map((id) => (
            <ModuleRow key={id} id={id} />
          ))}
        </div>

        <h2 className="kicker mb-3">Aura</h2>
        <div className="flex flex-wrap gap-2">
          {CORE_APPS.map((app) => {
            const { label, icon: Icon } = appInfo(app, extensions);
            return (
              <Button key={app} variant="outline" onClick={(e) => open(app, e.shiftKey)}>
                <Icon /> {label}
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** A built-in module: open it, turn it on or off (with what depends on it). */
function ModuleRow({ id }: { id: ModuleId }) {
  const modules = useModules();
  const [confirm, setConfirm] = useState<ModuleId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const spec = MODULES[id];
  const on = modules[id];
  const { icon: Icon } = appInfo(MODULE_APP[id], []);

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
    <div className="bg-card flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
      <Icon className={cn("size-5", on ? "text-primary" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{spec.name}</div>
        <div className="text-muted-foreground text-xs">{spec.description}</div>
        {error && <div className="text-destructive text-xs">{error}</div>}
      </div>
      {on && (
        <Button size="sm" variant="ghost" onClick={(e) => open(MODULE_APP[id], e.shiftKey)}>
          Open
        </Button>
      )}
      {confirm ? (
        <span className="flex items-center gap-1.5 text-xs">
          Also turns off {confirm.map((m) => MODULES[m].name).join(", ")}.
          <Button size="sm" variant="destructive" onClick={() => void toggle(false)}>
            Turn off
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </span>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${on ? "Turn off" : "Turn on"} ${spec.name}`}
          title={on ? `Turn off ${spec.name}` : `Turn on ${spec.name}`}
          onClick={ask}
          className={cn(
            "relative h-6 w-10 shrink-0 rounded-full transition-colors",
            on ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "bg-background absolute top-0.5 size-5 rounded-full shadow transition-all",
              on ? "left-[18px]" : "left-0.5",
            )}
          />
        </button>
      )}
    </div>
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
    ...(chats ? [{ id: null, name: "Empty" }] : []),
    ...templates.map((p) => ({ id: p.id as string | null, name: p.name })),
  ];
  return (
    <div className="bg-card mb-10 grid max-w-xl gap-2 rounded-2xl border p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <LayoutGrid className="size-4" /> New app
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
            aria-label="App name"
            placeholder="Name, e.g. Clients"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-background rounded-lg border px-2 py-1 text-sm"
          />
          <textarea
            aria-label="What it should do"
            placeholder="What it should do (optional: you can tell @builder in its chat)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-background resize-none rounded-lg border px-2 py-1 text-sm"
          />
        </>
      ) : (
        <p className="text-muted-foreground text-xs">
          No templates left to add. Turn on Chats to build your own app with agents.
        </p>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || (!template && (!chats || !name.trim()))}
          onClick={() => void create()}
        >
          Create
        </Button>
        <Button size="sm" variant="ghost" onClick={(e) => open("page:catalog", e.shiftKey)}>
          Browse the catalog
        </Button>
      </div>
    </div>
  );
}

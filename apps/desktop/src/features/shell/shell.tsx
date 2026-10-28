import {
  type AppRef,
  type LayoutNode,
  MODULES,
  moduleOfApp,
  PAGE_IDS,
  type Placement,
  type Project,
  type Tile,
  tiles,
} from "@aura/shared";
import { Pin, PinOff, Plus, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AuraLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AgentsView } from "@/features/agents/agents-view";
import { CatalogView } from "@/features/catalog/catalog-view";
import { loadInitial, reportError } from "@/features/chat/actions";
import { ChatView } from "@/features/chat/chat-view";
import { Sidebar } from "@/features/chat/sidebar";
import { setState, useChatStore } from "@/features/chat/store";
import { CustomizeView, loadCustomize } from "@/features/customize/customize-view";
import { ExtensionFrame } from "@/features/customize/extension-frame";
import { DevicesView } from "@/features/devices/devices-view";
import { EnginesView } from "@/features/engines/engines-view";
import { JobsView } from "@/features/jobs/jobs-view";
import { MemoryView } from "@/features/memory/memory-view";
import { SkillsView } from "@/features/skills/skills-view";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AppControls, AppSecretsMenu } from "./app-controls";
import { appAvailable, appInfo, useExtensionApps, useModules } from "./apps";
import { HomeView } from "./home";
import { closeTileId, focusTile, openAppRef, PHONE_QUERY, phoneAppOf, resizeSplit } from "./layout";

/** True on phone-sized screens, where the shell shows one app at a time. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(PHONE_QUERY);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
  );
}

/**
 * The shell (ADR 0024, ADR 0027): the user's apps laid out as tiles, one app each, split and
 * resizable. On a phone only the focused tile's app is shown.
 */
export function Shell() {
  const layout = useChatStore((s) => s.layout);
  const phoneApp = useChatStore(phoneAppOf);
  const phone = useIsPhone();
  if (phone) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <AppView app={phoneApp} />
      </div>
    );
  }
  return (
    // The desktop behind the tiles; its padding and the handles make the gaps (ADR 0028).
    <div className="bg-sidebar flex min-h-0 min-w-0 flex-1 p-[var(--wm-gap)]">
      <NodeView node={layout.root} focused={layout.focused} many={tiles(layout.root).length > 1} />
    </div>
  );
}

function NodeView({ node, focused, many }: { node: LayoutNode; focused: string; many: boolean }) {
  if (node.kind === "tile")
    return <TileView tile={node} focused={focused === node.id} many={many} />;
  return (
    <ResizablePanelGroup
      // A new set of children is a new group; sizes come from the layout when it mounts.
      key={node.children.map((c) => c.id).join(",")}
      id={node.id}
      orientation={node.dir === "row" ? "horizontal" : "vertical"}
      defaultLayout={Object.fromEntries(node.children.map((c, i) => [c.id, node.sizes[i] ?? 0]))}
      onLayoutChanged={(sizes, meta) => {
        if (meta.isUserInteraction)
          resizeSplit(
            node.id,
            node.children.map((c) => sizes[c.id] ?? 0),
          );
      }}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && (
            <ResizableHandle className="hover:bg-primary/40 aria-[orientation=horizontal]:min-h-px aria-[orientation=horizontal]:h-[var(--wm-gap)] min-w-px w-[var(--wm-gap)] rounded-full bg-transparent" />
          )}
          <ResizablePanel id={child.id} minSize="12%" className="flex min-h-0 min-w-0">
            <NodeView node={child} focused={focused} many={many} />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

function TileView({ tile, focused, many }: { tile: Tile; focused: boolean; many: boolean }) {
  const extensions = useExtensionApps();
  const modules = useModules();
  const titles = useChatStore((s) => s.appearance?.wm.titles ?? "minimal");
  const { label, icon: Icon } = appInfo(tile.app, extensions);
  const ext = tile.app.startsWith("ext:")
    ? extensions.find((e) => e.id === tile.app.slice(4))
    : undefined;
  const chatOpen = useChatStore((s) => (ext?.app ? (s.appChat[ext.id] ?? false) : false));
  const chatId = modules.chats && chatOpen ? ext?.app?.chatId : undefined;
  // Buttons show on hover in the thin and hidden title bars, and always in the full one.
  const hoverOnly =
    titles !== "full" &&
    "opacity-0 transition-opacity group-hover/tile:opacity-100 focus-within:opacity-100";
  return (
    <section
      data-tile-id={tile.id}
      aria-label={label}
      className={cn(
        "group/tile bg-background relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-solid",
        focused && (many || titles !== "full") ? "border-primary" : "border-border",
      )}
      style={{ borderWidth: "var(--wm-border)", borderRadius: "var(--wm-radius)" }}
      onMouseDownCapture={() => focusTile(tile.id)}
      onFocusCapture={() => focusTile(tile.id)}
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-0.5 px-1",
          titles === "full" && "bg-sidebar h-9 border-b",
          titles === "minimal" && "h-7",
          titles === "none" &&
            "bg-background/90 absolute inset-x-0 top-0 z-20 h-9 border-b opacity-0 backdrop-blur transition-opacity group-hover/tile:opacity-100 focus-within:opacity-100",
          titles === "full" && many && focused && "shadow-[inset_0_-2px_0_var(--primary)]",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 px-2 font-medium",
            titles === "minimal" ? "text-muted-foreground text-[11px]" : "text-xs",
            titles === "minimal" && focused && "text-foreground",
          )}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <div className={cn("flex items-center gap-0.5", hoverOnly)}>
          {ext && ext.secrets.length > 0 && <AppSecretsMenu appId={ext.id} />}
          {ext &&
            (ext.app ? (
              <AppControls ext={ext} chat={modules.chats} />
            ) : (
              modules.chats && <PinButton app={tile.app} />
            ))}
          <OpenMenu />
          {(many || tile.app !== "home") && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={`Close ${label}`}
              title={many ? `Close ${label}` : `Close ${label} and go home`}
              onClick={() => closeTileId(tile.id)}
            >
              <X />
            </Button>
          )}
        </div>
      </header>
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <AppView app={tile.app} />
        {chatId && (
          // The app's chat, inside its tile (ADR 0027): use and change the app without leaving it.
          <aside className="bg-background flex w-[min(440px,50%)] shrink-0 border-l max-md:absolute max-md:inset-0 max-md:w-full">
            <ChatView key={chatId} chatId={chatId} inApp />
          </aside>
        )}
      </div>
    </section>
  );
}

/** Opens any app in this tile, or in a new tile to the right or below. */
function OpenMenu() {
  const [open, setOpen] = useState(false);
  const [where, setWhere] = useState<Placement>("right");
  const box = useRef<HTMLDivElement>(null);
  const extensions = useExtensionApps();
  const modules = useModules();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const yours: AppRef[] = extensions.map((e) => `ext:${e.id}` as AppRef);
  const aura: AppRef[] = (
    ["home", "messenger", ...PAGE_IDS.map((p) => `page:${p}`)] as AppRef[]
  ).filter((app) => appAvailable(app, modules));
  const item = (app: AppRef) => {
    const { label, icon: Icon } = appInfo(app, extensions);
    return (
      <li key={app}>
        <button
          type="button"
          className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
          onClick={() => {
            openAppRef(app, where);
            setOpen(false);
          }}
        >
          <Icon className="size-4" /> {label}
        </button>
      </li>
    );
  };
  return (
    <div className="relative" ref={box}>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Open an app"
        title="Open an app here, to the right or below"
        onClick={() => setOpen(!open)}
      >
        <Plus />
      </Button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-8 right-0 z-30 w-60 rounded-xl border p-2 shadow-lg">
          <div className="mb-2 flex gap-1 text-xs">
            {(
              [
                ["here", "Here"],
                ["right", "Right"],
                ["below", "Below"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={where === key}
                onClick={() => setWhere(key)}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1",
                  where === key ? "border-primary bg-primary/10" : "hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-96 overflow-y-auto">
            <p className="kicker px-2 pt-1 pb-1">Your apps</p>
            {yours.length > 0 ? (
              <ul>{yours.map(item)}</ul>
            ) : (
              <p className="text-muted-foreground px-2 pb-2 text-xs">
                None yet. Add one on the Home shelf.
              </p>
            )}
            <p className="kicker px-2 pt-2 pb-1">Aura</p>
            <ul>{aura.map(item)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pins the extension as the app of the project whose chat is open (it then opens by itself). */
function PinButton({ app }: { app: AppRef }) {
  const project = useChatStore((s) => {
    const chat = s.activeChatId ? s.chats[s.activeChatId] : undefined;
    return chat?.projectId ? s.projects[chat.projectId] : undefined;
  });
  if (!project) return null;
  const id = app.slice(4);
  const pinned = project.app === id;
  const toggle = async () => {
    try {
      const updated = await call(() =>
        api.projects({ projectId: project.id }).app.put({ extensionId: pinned ? null : id }),
      );
      setState((s) => ({ projects: { ...s.projects, [project.id]: updated as Project } }));
    } catch (error) {
      reportError(error);
    }
  };
  return (
    <Button
      size="icon"
      variant={pinned ? "secondary" : "ghost"}
      className="size-7"
      aria-label={pinned ? `Unpin from ${project.name}` : `Pin to ${project.name}`}
      title={
        pinned
          ? `Unpin from ${project.name}`
          : `Pin to ${project.name}: it opens next to the project's chat`
      }
      onClick={() => void toggle()}
    >
      {pinned ? <PinOff /> : <Pin />}
    </Button>
  );
}

/** Why an app's tile is empty: safe mode, the app is off, or it has a problem. */
function AppUnavailable({ id }: { id: string }) {
  const customize = useChatStore((s) => s.customize);
  const [error, setError] = useState<string | null>(null);
  const info = customize?.extensions.find((e) => e.id === id);
  let text: string;
  let action: { label: string; run: () => Promise<unknown> } | null = null;
  if (!customize) return null;
  if (customize.safeMode.on) {
    text = `Safe mode is on (${customize.safeMode.reason}), so apps and MCP servers are off.`;
    action = {
      label: "Leave safe mode",
      run: () => call(() => api.customize["safe-mode"].off.post()),
    };
  } else if (!info) text = "This app is not installed.";
  else if (info.problem) text = `This app cannot run: ${info.problem}`;
  else if (!info.enabled) {
    text = "This app is turned off.";
    action = {
      label: "Turn on",
      run: () => call(() => api.extensions({ extensionId: id }).enabled.post({ enabled: true })),
    };
  } else text = "This app has no screen.";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-muted-foreground max-w-sm text-sm">{text}</p>
      {action && (
        <Button
          variant="outline"
          onClick={() =>
            void action
              .run()
              .then(() => loadCustomize())
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          }
        >
          {action.label}
        </Button>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

/** A built-in app whose module is off (ADR 0027): say so and offer to turn it on. */
function ModuleOff({ app }: { app: AppRef }) {
  const module = moduleOfApp(app);
  const [error, setError] = useState<string | null>(null);
  if (!module) return null;
  const turnOn = () =>
    call(() => api.modules({ moduleId: module }).put({ enabled: true }))
      .then(() => loadCustomize())
      .then(() => (module === "chats" ? loadInitial() : undefined))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-muted-foreground max-w-sm text-sm">
        {MODULES[module].name} is turned off.
      </p>
      <Button variant="outline" onClick={() => void turnOn()}>
        Turn on {MODULES[module].name}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

/** What an app shows inside its tile. */
function AppView({ app }: { app: AppRef }) {
  const extensions = useExtensionApps();
  const chatId = useChatStore((s) => s.activeChatId);
  const projectId = useChatStore((s) => (chatId ? (s.chats[chatId]?.projectId ?? null) : null));
  const previewDraft = useChatStore((s) => s.previewDraft);
  const modules = useModules();
  if (app === "home") return <HomeView />;
  if (!appAvailable(app, modules)) return <ModuleOff app={app} />;
  if (app === "messenger") return <Messenger />;
  if (app.startsWith("ext:")) {
    const ext = extensions.find((e) => e.id === app.slice(4));
    if (!ext) return <AppUnavailable id={app.slice(4)} />;
    const draft = Boolean(ext.app?.draft && previewDraft[ext.id]);
    return (
      <ExtensionFrame
        // A new approved version or the draft preview reloads the frame.
        key={`${ext.id}:${ext.app?.revision ?? ""}:${draft}`}
        extension={ext}
        variant="side"
        draft={draft}
        context={{ chatId, projectId }}
      />
    );
  }
  switch (app.slice(5)) {
    case "skills":
      return <SkillsView />;
    case "memory":
      return <MemoryView />;
    case "agents":
      return <AgentsView />;
    case "catalog":
      return <CatalogView />;
    case "jobs":
      return <JobsView />;
    case "engines":
      return <EnginesView />;
    case "customize":
      return <CustomizeView />;
    case "devices":
      return <DevicesView />;
    default:
      return null;
  }
}

/** The first app: the chat list and the open chat. */
function Messenger() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const pane = useChatStore((s) => s.pane);
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <Sidebar />
      <div className={cn("flex min-w-0 flex-1", pane === "list" && "max-md:hidden")}>
        {activeChatId ? (
          <ChatView key={activeChatId} chatId={activeChatId} />
        ) : (
          <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <AuraLogo className="size-12 animate-pulse" />
            <p className="text-muted-foreground text-sm">Waking up…</p>
          </main>
        )}
      </div>
    </div>
  );
}

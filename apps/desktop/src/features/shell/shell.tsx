import {
  type AppRef,
  type LayoutNode,
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
import { reportError } from "@/features/chat/actions";
import { ChatView } from "@/features/chat/chat-view";
import { Sidebar } from "@/features/chat/sidebar";
import { setState, useChatStore } from "@/features/chat/store";
import { CustomizeView } from "@/features/customize/customize-view";
import { ExtensionFrame } from "@/features/customize/extension-frame";
import { DevicesView } from "@/features/devices/devices-view";
import { EnginesView } from "@/features/engines/engines-view";
import { IntegrationsView } from "@/features/integrations/integrations-view";
import { JobsView } from "@/features/jobs/jobs-view";
import { MemoryView } from "@/features/memory/memory-view";
import { SkillsView } from "@/features/skills/skills-view";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { appInfo, useExtensionApps } from "./apps";
import {
  closeAppRef,
  closeTileId,
  focusTile,
  openAppRef,
  PHONE_QUERY,
  phoneAppOf,
  resizeSplit,
} from "./layout";

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
 * The shell (ADR 0024): the user's apps laid out as tiles, with tabs, split and resizable. On a
 * phone only the focused tile's app is shown.
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
    <div className="flex min-h-0 min-w-0 flex-1">
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
          {i > 0 && <ResizableHandle />}
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
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
      onMouseDownCapture={() => focusTile(tile.id)}
      onFocusCapture={() => focusTile(tile.id)}
    >
      <header
        className={cn(
          "bg-sidebar flex h-9 shrink-0 items-center gap-0.5 border-b px-1",
          many && focused && "shadow-[inset_0_-2px_0_var(--primary)]",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tile.tabs.map((app) => {
            const { label, icon: Icon } = appInfo(app, extensions);
            const active = app === tile.active;
            return (
              <div
                key={app}
                className={cn(
                  "group flex h-7 shrink-0 items-center rounded-lg text-xs",
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-2"
                  onClick={() => openAppRef(app)}
                >
                  <Icon className="size-3.5" />
                  <span className="max-w-40 truncate">{label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${label}`}
                  className="hover:bg-accent mr-1 rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  onClick={() => closeAppRef(app)}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
        {tile.active.startsWith("ext:") && <PinButton app={tile.active} />}
        <OpenMenu />
        {many && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Close this tile"
            title="Close this tile"
            onClick={() => closeTileId(tile.id)}
          >
            <X />
          </Button>
        )}
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">
        <AppView app={tile.active} />
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
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const apps: AppRef[] = [
    "messenger",
    ...extensions.map((e) => `ext:${e.id}` as AppRef),
    ...PAGE_IDS.map((p) => `page:${p}` as AppRef),
  ];
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
          <ul className="max-h-80 overflow-y-auto">
            {apps.map((app) => {
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
            })}
          </ul>
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

/** What an app shows inside its tile. */
function AppView({ app }: { app: AppRef }) {
  const extensions = useExtensionApps();
  const chatId = useChatStore((s) => s.activeChatId);
  const projectId = useChatStore((s) => (chatId ? (s.chats[chatId]?.projectId ?? null) : null));
  if (app === "messenger") return <Messenger />;
  if (app.startsWith("ext:")) {
    const ext = extensions.find((e) => e.id === app.slice(4));
    if (!ext) return null;
    return (
      <ExtensionFrame key={ext.id} extension={ext} variant="side" context={{ chatId, projectId }} />
    );
  }
  switch (app.slice(5)) {
    case "skills":
      return <SkillsView />;
    case "memory":
      return <MemoryView />;
    case "agents":
      return <AgentsView />;
    case "integrations":
      return <IntegrationsView />;
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

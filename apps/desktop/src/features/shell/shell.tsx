import {
  type AppRef,
  type LayoutNode,
  type PageId,
  type Project,
  type Tile,
  tiles,
} from "@aura/shared";
import { PanelRight, Pin, PinOff, SquarePlus, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AuraLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { reportError } from "@/features/chat/actions";
import { ChatView } from "@/features/chat/chat-view";
import { Sidebar } from "@/features/chat/sidebar";
import { setState, useChatStore } from "@/features/chat/store";
import { ExtensionFrame } from "@/features/customize/extension-frame";
import { loadCustomize } from "@/features/customize/state";
import { FilePicker } from "@/features/files/picker";
import { FileViewer } from "@/features/files/viewer";
import { tr, useT } from "@/features/localization/i18n";
import { SettingsView } from "@/features/settings/settings-view";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AppControls, AppSecretsMenu } from "./app-controls";
import { appInfo, openEntry, useExtensionApps } from "./apps";
import { HomeView } from "./home";
import { useLauncher } from "./launcher";
import { closeTileId, focusTile, openAppRef, PHONE_QUERY, phoneAppOf, resizeSplit } from "./layout";
import { NewAppSheet } from "./new-app-sheet";
import { AppRow, StartMenu } from "./start-menu";

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
      <div className="@container relative flex min-h-0 min-w-0 flex-1">
        <AppView app={phoneApp} />
        <NewAppSheet />
        <FileViewer />
        <FilePicker />
      </div>
    );
  }
  return (
    // The desktop behind the tiles; its padding and the handles make the gaps (ADR 0028). The
    // "My apps" menu and the "New app" sheet open over it (ADR 0034).
    <div className="bg-background relative flex min-h-0 min-w-0 flex-1 p-[var(--wm-gap)]">
      <NodeView node={layout.root} focused={layout.focused} many={tiles(layout.root).length > 1} />
      <StartMenu />
      <NewAppSheet />
      <FileViewer />
      <FilePicker />
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
            <ResizableHandle className="hover:bg-primary/40 aria-[orientation=horizontal]:min-h-px aria-[orientation=horizontal]:h-[var(--wm-gap)] min-w-px w-[var(--wm-gap)] rounded-pill bg-transparent" />
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
  const titles = useChatStore((s) => s.appearance?.wm.titles ?? "minimal");
  const t = useT();
  const info = appInfo(tile.app, extensions);
  const label = tile.app.startsWith("ext:") ? info.label : t(info.label);
  const Icon = info.icon;
  const ext = tile.app.startsWith("ext:")
    ? extensions.find((e) => e.id === tile.app.slice(4))
    : undefined;
  const chatOpen = useChatStore((s) => (ext?.app ? (s.appChat[ext.id] ?? false) : false));
  const chatId = chatOpen ? ext?.app?.chatId : undefined;
  return (
    <section
      data-tile-id={tile.id}
      data-part="tile"
      aria-label={label}
      className={cn(
        "group/tile bg-tile @container relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-solid",
        focused && many ? "border-ring" : "border-tile-border",
      )}
      style={{ borderWidth: "var(--wm-border)", borderRadius: "var(--wm-radius)" }}
      onMouseDownCapture={() => focusTile(tile.id)}
      onFocusCapture={() => focusTile(tile.id)}
    >
      <header
        data-part="tile-title"
        className={cn(
          "text-tile-title-foreground flex shrink-0 items-center gap-0.5 border-b pr-1 pl-3",
          titles === "minimal" && "bg-tile-title h-[38px]",
          titles === "full" &&
            (focused && many
              ? "bg-primary text-primary-foreground h-[30px]"
              : "bg-tile-title h-[30px]"),
          titles === "none" &&
            "bg-tile-title/95 absolute inset-x-0 top-0 z-20 h-[38px] opacity-0 backdrop-blur transition-opacity group-hover/tile:opacity-100 focus-within:opacity-100",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            titles === "full" ? "text-[13px]" : "text-sm",
          )}
        >
          <Icon className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {ext && !ext.app && ext.secrets.length > 0 && <AppSecretsMenu appId={ext.id} />}
          {ext && (ext.app ? <AppControls ext={ext} /> : <PinButton app={tile.app} />)}
          <OpenMenu />
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground size-7"
            aria-label={t("New window beside")}
            title={t("New window beside")}
            onClick={() => openAppRef("home", "right")}
          >
            <PanelRight strokeWidth={1.5} />
          </Button>
          {(many || tile.app !== "home") && (
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground size-7"
              aria-label={t("Close")}
              title={t("Close")}
              onClick={() => closeTileId(tile.id)}
            >
              <X strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </header>
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <AppView app={tile.app} />
        {chatId && (
          // The app's chat, inside its tile (ADR 0027): use and change the app without leaving it.
          <aside className="bg-background flex w-[min(380px,42%)] shrink-0 border-l @max-[640px]:absolute @max-[640px]:inset-0 @max-[640px]:z-10 @max-[640px]:w-full">
            <ChatView key={chatId} chatId={chatId} inApp />
          </aside>
        )}
      </div>
    </section>
  );
}

/** "Open another app here": every app by group, opened in this tile (ADR 0034). */
function OpenMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const groups = useLauncher();
  const t = useT();
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
  return (
    <div className="relative" ref={box}>
      <Button
        size="icon"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground size-7"
        aria-label={t("Open another app here")}
        title={t("Open another app here")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <SquarePlus strokeWidth={1.5} />
      </Button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-8 right-0 z-30 max-h-[70vh] w-72 overflow-y-auto border p-2 shadow-md">
          {groups.map(({ group, entries }) => (
            <div key={group} className="mb-1.5 flex flex-col">
              <span className="text-muted-foreground px-2 py-1 text-xs font-medium">{group}</span>
              {entries.map((entry) => (
                <AppRow
                  key={entry.key}
                  entry={entry}
                  onOpen={() => {
                    openEntry(entry.key, entry.app);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          ))}
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

/** What an app shows inside its tile. */
function AppView({ app }: { app: AppRef }) {
  const extensions = useExtensionApps();
  const chatId = useChatStore((s) => s.activeChatId);
  const projectId = useChatStore((s) => (chatId ? (s.chats[chatId]?.projectId ?? null) : null));
  const previewDraft = useChatStore((s) => s.previewDraft);
  if (app === "home") return <HomeView />;
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
  // Every built-in page is Settings at one of its tabs (ADR 0039).
  return <SettingsView page={app.slice(5) as PageId} />;
}

/** The first app: the chat list and the open chat. */
function Messenger() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const pane = useChatStore((s) => s.pane);
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <Sidebar />
      <div className={cn("flex min-w-0 flex-1", pane === "list" && "@max-[640px]:hidden")}>
        {activeChatId ? (
          <ChatView key={activeChatId} chatId={activeChatId} />
        ) : (
          <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <AuraLogo className="size-12 animate-pulse" />
            <p className="text-muted-foreground text-sm">{tr("Waking up…")}</p>
          </main>
        )}
      </div>
    </div>
  );
}

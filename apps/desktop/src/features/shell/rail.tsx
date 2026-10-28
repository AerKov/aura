import {
  BAR_APP_ID,
  BAR_SIZE,
  type BarEdge,
  type ExtensionInfo,
  type ModKey,
  type PageId,
  visibleApps,
} from "@aura/shared";
import type { LucideIcon } from "lucide-react";
import { Bot, LayoutGrid, MessagesSquare, ShieldCheck } from "lucide-react";
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuraLogo } from "@/components/logo";
import { setState, useChatStore } from "@/features/chat/store";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { appAvailable, PAGES, railApp, useExtensionApps, useModules } from "./apps";
import { BarFrame, barThickness } from "./bar-frame";
import { openAppRef, phoneAppOf } from "./layout";
import { arrangeRail } from "./rail-layout";
import { useIsPhone } from "./shell";
import { isEditable, matchShortcut } from "./shortcut-keys";
import { runWmAction } from "./shortcuts";

export interface RailItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Open somewhere on the screen. */
  active: boolean;
}

/** Setup pages stay on the desktop; the phone's tab bar keeps the daily ones. */
const DESKTOP_ONLY = new Set(["catalog", "engines", "customize", "devices"]);

const PAGE_ORDER: PageId[] = ["skills", "memory", "agents", "catalog", "jobs"];
const PAGE_TAIL: PageId[] = ["engines", "customize", "devices"];

/** Every rail item in its default order, before the user's layout is applied. */
export function useRailItems(): RailItem[] {
  const layout = useChatStore((s) => s.layout);
  const phoneApp = useChatStore(phoneAppOf);
  const phone = useIsPhone();
  const extensions = useExtensionApps();
  const modules = useModules();
  const open = new Set(phone ? [phoneApp] : visibleApps(layout));
  const page = (id: PageId): RailItem => ({
    key: id,
    label: PAGES[id].label,
    icon: PAGES[id].icon,
    active: open.has(`page:${id}`),
  });
  return [
    { key: "chats", label: "Chats", icon: MessagesSquare, active: open.has("messenger") },
    ...PAGE_ORDER.map(page),
    ...extensions.map((ext) => ({
      key: `ext:${ext.id}`,
      label: ext.name,
      icon: extensionIcon(ext.icon),
      active: open.has(`ext:${ext.id}`),
    })),
    ...PAGE_TAIL.map(page),
  ].filter((item) => appAvailable(railApp(item.key), modules));
}

/** Where the bar's parts go for each edge: tooltips, the active mark, the push to the end. */
const EDGE = {
  left: {
    bar: "md:w-14 md:flex-col md:py-2 md:border-r",
    tip: "md:left-12",
    mark: "md:-left-2 md:top-1/2 md:h-5 md:w-1 md:-translate-y-1/2",
    end: "md:mt-auto",
  },
  right: {
    bar: "md:w-14 md:flex-col md:py-2 md:border-l",
    tip: "md:right-12",
    mark: "md:-right-2 md:top-1/2 md:h-5 md:w-1 md:-translate-y-1/2",
    end: "md:mt-auto",
  },
  top: {
    bar: "md:h-12 md:w-full md:flex-row md:px-2 md:border-b",
    tip: "md:top-11",
    mark: "md:-bottom-1 md:left-1/2 md:h-1 md:w-5 md:-translate-x-1/2",
    end: "md:ml-auto",
  },
  bottom: {
    bar: "md:h-12 md:w-full md:flex-row md:px-2 md:border-t",
    tip: "md:bottom-11",
    mark: "md:-top-1 md:left-1/2 md:h-1 md:w-5 md:-translate-x-1/2",
    end: "md:ml-auto",
  },
} as const;

/**
 * Aura's bar, like a tiling window manager's (ADR 0028): on any edge of the screen on desktop, a
 * tab bar at the bottom on phones. It opens apps into the shell's tiles; an item is lit while its
 * app is on screen. It ends with the status (approvals, working agents, the clock, the
 * connection) and carries the keyboard shortcuts. The user arranges it on the Customize page.
 */
export function Rail() {
  const pane = useChatStore((s) => s.pane);
  const current = useChatStore(phoneAppOf);
  const rail = useChatStore((s) => s.appearance?.rail);
  const mod = useChatStore((s) => s.appearance?.wm.mod ?? "alt");
  const phone = useIsPhone();
  const items = arrangeRail(useRailItems(), rail);
  const layout = useChatStore((s) => s.layout);
  const homeOpen = phone ? current === "home" : visibleApps(layout).includes("home");
  const edge = EDGE[rail?.edge ?? "left"];
  const pendingApprovals = usePendingApprovals();
  const vertical = rail?.edge !== "top" && rail?.edge !== "bottom";

  // Click: open in the focused tile (or show it if open). Shift-click: open in a tile to the right.
  const open = useCallback(
    (key: string, shift = false) => {
      if (key === "chats" && phone) setState(() => ({ pane: "list" }));
      openAppRef(railApp(key), shift && !phone ? "right" : "here");
    },
    [phone],
  );

  const keys = items.map((i) => i.key).join(",");
  useEffect(() => {
    if (phone) return;
    const apps = keys ? keys.split(",") : [];
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const action = matchShortcut(e, mod, isEditable(e.target));
      if (!action) return;
      e.preventDefault();
      runWmAction(action, apps, (key) => open(key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone, mod, keys, open]);

  // On phones the tab bar hides inside a conversation, where the composer needs the space.
  const hideOnPhone = current === "messenger" && pane === "main";

  // Which bar on the desktop (ADR 0029): the built-in one, the user's bar app, or none. The
  // built-in one stands in while the bar app is missing, off, failed or in safe mode.
  const mode = rail?.mode ?? "builtin";
  const barApp = useBarApp();
  const failed = useChatStore((s) => s.barFailed);
  const barVersion = `${barApp?.app?.revision ?? ""}:${mode}`;
  // A new version of the bar (or switching to it) gets another chance.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the version changes
  useEffect(() => setState(() => ({ barFailed: null })), [barVersion]);
  const appBar = mode === "app" && barApp && !failed && !phone ? barApp : null;
  const builtinOnDesktop = mode === "builtin" || (mode === "app" && !appBar);
  const barState = useBarState(
    items,
    homeOpen,
    rail?.edge ?? "left",
    barThickness(rail?.edge ?? "left", rail?.size ?? null),
    vertical,
    mod,
  );

  return (
    <>
      {appBar && (
        <BarFrame
          ext={appBar}
          edge={rail?.edge ?? "left"}
          size={rail?.size ?? null}
          state={barState}
          open={(key, where) => openAppRef(railApp(key), where)}
        />
      )}
      <nav
        aria-label="Main"
        className={cn(
          "bg-rail text-rail-foreground z-20 flex shrink-0 items-center gap-1 max-md:border-t",
          edge.bar,
          "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:h-16 max-md:justify-around max-md:px-2 max-md:pb-[env(safe-area-inset-bottom)]",
          hideOnPhone && "max-md:hidden",
          !builtinOnDesktop && "md:hidden",
        )}
        style={
          rail?.size && !phone
            ? vertical
              ? { width: Math.max(rail.size, BAR_SIZE.builtinMin) }
              : { height: Math.max(rail.size, BAR_SIZE.builtinMin) }
            : undefined
        }
      >
        <button
          type="button"
          title="Home: all your apps (Shift-click: open on the right)"
          aria-label="Home"
          aria-current={homeOpen ? "page" : undefined}
          onClick={(e) => openAppRef("home", e.shiftKey && !phone ? "right" : "here")}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            vertical ? "md:mb-2" : "md:mr-2",
          )}
        >
          <AuraLogo className="size-8" />
        </button>
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            title={`${item.label}${index < 9 ? ` (${modLabel(mod)}+${index + 1})` : ""}; Shift-click: open on the right`}
            aria-label={item.label}
            aria-current={item.active ? "page" : undefined}
            onClick={(e) => open(item.key, e.shiftKey)}
            className={cn(
              "group relative flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
              item.active
                ? "bg-accent text-foreground"
                : "hover:bg-accent/70 hover:text-foreground",
              item.key === "customize" && edge.end,
              DESKTOP_ONLY.has(item.key) && "max-md:hidden",
            )}
          >
            <item.icon className="size-5" />
            {item.key === "chats" && pendingApprovals > 0 && (
              <span
                className="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full md:hidden"
                title="Approvals waiting"
              />
            )}
            {item.active && (
              <span className={cn("bg-primary absolute hidden rounded-full md:block", edge.mark)} />
            )}
            <span
              className={cn(
                "bg-foreground text-background pointer-events-none absolute z-30 hidden rounded-lg px-2 py-1 font-mono text-[11px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 md:block",
                edge.tip,
              )}
            >
              {item.label}
            </span>
          </button>
        ))}
        <Status vertical={vertical} />
      </nav>
    </>
  );
}

/** The bar app, when it is installed, enabled and allowed to be the bar (not in safe mode). */
function useBarApp(): ExtensionInfo | null {
  const customize = useChatStore((s) => s.customize);
  return useMemo(() => {
    if (!customize || customize.safeMode.on) return null;
    const ext = customize.extensions.find((e) => e.id === BAR_APP_ID);
    return ext?.enabled && ext.permissions.includes("ui.bar") ? ext : null;
  }, [customize]);
}

const svgCache = new Map<LucideIcon, string>();
/** An icon as SVG markup, for the bar app's frame. */
function svgOf(icon: LucideIcon): string {
  let svg = svgCache.get(icon);
  if (!svg) {
    svg = renderToStaticMarkup(createElement(icon, { size: 24 }));
    svgCache.set(icon, svg);
  }
  return svg;
}

/** What the bar app sees (README.md of the bar app documents it). */
function useBarState(
  items: RailItem[],
  homeOpen: boolean,
  edge: BarEdge,
  size: number,
  vertical: boolean,
  mod: ModKey,
) {
  const connection = useChatStore((s) => s.connection);
  const approvals = usePendingApprovals();
  const working = useChatStore((s) => Object.keys(s.streaming).length);
  // The items are a new array every render; the state changes only when its content does.
  const json = JSON.stringify({
    edge,
    size,
    vertical,
    mod,
    home: { key: "home", label: "Home", svg: svgOf(LayoutGrid), active: homeOpen },
    items: items.map((item, i) => ({
      key: item.key,
      label: item.label,
      svg: svgOf(item.icon),
      active: item.active,
      shortcut: i < 9 ? `${modLabel(mod)}+${i + 1}` : null,
    })),
    status: { approvals, working, connection },
  });
  return useMemo(() => JSON.parse(json) as unknown, [json]);
}

function usePendingApprovals(): number {
  return useChatStore(
    (s) =>
      Object.values(s.messages)
        .flat()
        .filter((m) => m.card?.type === "approval" && m.card.status === "pending").length,
  );
}

export function modLabel(mod: ModKey): string {
  return mod === "alt" ? "Alt" : mod === "ctrl-alt" ? "Ctrl+Alt" : "Super";
}

/** The bar's status, like waybar's modules: approvals, working agents, the clock, the connection. */
function Status({ vertical }: { vertical: boolean }) {
  const connection = useChatStore((s) => s.connection);
  const chats = useModules().chats;
  const pendingApprovals = usePendingApprovals();
  const working = useChatStore((s) => Object.keys(s.streaming).length);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  // A vertical bar is narrow: hours over minutes, 24-hour.
  const time = vertical
    ? `${String(now.getHours()).padStart(2, "0")}\n${String(now.getMinutes()).padStart(2, "0")}`
    : now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div
      className={cn(
        "hidden items-center gap-1.5 font-mono text-[11px] md:flex",
        vertical ? "mt-2 flex-col" : "ml-3 flex-row",
      )}
    >
      {chats && pendingApprovals > 0 && (
        <button
          type="button"
          onClick={() => openAppRef("messenger")}
          title={`${pendingApprovals} waiting for your approval`}
          className="bg-primary text-primary-foreground flex items-center gap-1 rounded-full px-1.5 py-0.5"
        >
          <ShieldCheck className="size-3" />
          {pendingApprovals}
        </button>
      )}
      {chats && working > 0 && (
        <span
          title={`${working} agent${working === 1 ? "" : "s"} working`}
          className="text-primary flex items-center gap-1"
        >
          <Bot className="size-3.5 animate-pulse" />
          {working}
        </span>
      )}
      <span
        className="text-muted-foreground text-center leading-tight whitespace-pre tabular-nums"
        title={now.toLocaleString()}
      >
        {time}
      </span>
      <span
        title={
          connection === "open"
            ? "Connected"
            : connection === "connecting"
              ? "Connecting…"
              : "Offline"
        }
        className={cn(
          "size-2 rounded-full",
          connection === "open"
            ? "bg-emerald-400"
            : connection === "connecting"
              ? "bg-amber-400"
              : "bg-rose-500",
        )}
      />
    </div>
  );
}

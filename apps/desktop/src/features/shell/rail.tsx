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
import { LayoutGrid } from "lucide-react";
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openChat } from "@/features/chat/actions";
import { getState, setState, useChatStore } from "@/features/chat/store";
import { tr, useT } from "@/features/localization/i18n";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { BUILTIN_ICONS, openEntry, PAGES, railApp, replacementOf, useExtensionApps } from "./apps";
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
  /** Shown in a tile now. */
  active: boolean;
  /** Shown in the focused tile. */
  focused: boolean;
}

/** Setup pages stay on the desktop; the phone's tab bar keeps the daily ones. */
const DESKTOP_ONLY = new Set<string>([]);

/** The bar's built-in items around the user's apps (ADR 0039). */
const HEAD = ["chats"];
const TAIL: PageId[] = ["settings"];

/** Every rail item in its default order, before the user's layout is applied. */
export function useRailItems(): RailItem[] {
  const layout = useChatStore((s) => s.layout);
  const phoneApp = useChatStore(phoneAppOf);
  const phone = useIsPhone();
  const extensions = useExtensionApps();
  const t = useT();
  const open = new Set(phone ? [phoneApp] : visibleApps(layout));
  const focusedApp = phone ? phoneApp : focusedAppOf(layout);
  const builtin = (key: string): RailItem => {
    const app = railApp(key);
    const label = key === "chats" ? "Chats" : PAGES[key as PageId].label;
    const icon = key === "chats" ? (BUILTIN_ICONS[key] ?? LayoutGrid) : PAGES[key as PageId].icon;
    const shown = open.has(app);
    return { key, label: t(label), icon, active: shown, focused: shown && focusedApp === app };
  };
  const appItem = (ext: (typeof extensions)[number]): RailItem => ({
    key: `ext:${ext.id}`,
    label: ext.name,
    icon: extensionIcon(ext.icon),
    active: open.has(`ext:${ext.id}`),
    focused: focusedApp === `ext:${ext.id}`,
  });
  // An app that replaces a built-in one stands in its place on the bar (ADR 0041).
  const placed = (key: string): RailItem => {
    const replacement = replacementOf(key, extensions);
    return replacement ? appItem(replacement) : builtin(key);
  };
  const builtinKeys = new Set<string>([...HEAD, ...TAIL]);
  return [
    ...HEAD.map(placed),
    ...extensions.filter((e) => !e.replaces || !builtinKeys.has(e.replaces)).map(appItem),
    ...TAIL.map(placed),
  ];
}

function focusedAppOf(layout: ReturnType<typeof getState>["layout"]): string | null {
  const find = (node: typeof layout.root): string | null => {
    if (node.kind === "tile") return node.id === layout.focused ? node.app : null;
    for (const child of node.children) {
      const app = find(child);
      if (app) return app;
    }
    return null;
  };
  return find(layout.root);
}

/** Where the bar's parts go for each edge: tooltips, the active mark, the push to the end. */
const EDGE = {
  left: {
    bar: "md:w-14 md:flex-col md:py-2.5",
    tip: "md:left-12",
    mark: "md:left-0 md:inset-y-0 md:w-0.5",
    end: "md:mt-auto",
  },
  right: {
    bar: "md:w-14 md:flex-col md:py-2.5",
    tip: "md:right-12",
    mark: "md:right-0 md:inset-y-0 md:w-0.5",
    end: "md:mt-auto",
  },
  top: {
    bar: "md:h-12 md:w-full md:flex-row md:px-2.5",
    tip: "md:top-11",
    mark: "md:top-0 md:inset-x-0 md:h-0.5",
    end: "md:ml-auto",
  },
  bottom: {
    bar: "md:h-12 md:w-full md:flex-row md:px-2.5",
    tip: "md:bottom-11",
    mark: "md:bottom-0 md:inset-x-0 md:h-0.5",
    end: "md:ml-auto",
  },
} as const;

/**
 * Aura's bar (ADR 0028): on any edge of the screen on desktop, a
 * tab bar at the bottom on phones. It opens apps into the shell's tiles; an item is lit while its
 * app is on screen. It ends with the status (approvals, working agents, the clock, the
 * connection) and carries the keyboard shortcuts. The user arranges it on the Customize page.
 */
export function Rail() {
  const t = useT();
  const pane = useChatStore((s) => s.pane);
  const current = useChatStore(phoneAppOf);
  const rail = useChatStore((s) => s.appearance?.rail);
  const mod = useChatStore((s) => s.appearance?.wm.mod ?? "alt");
  const phone = useIsPhone();
  const items = arrangeRail(useRailItems(), rail);
  const layout = useChatStore((s) => s.layout);
  const homeOpen = phone ? current === "home" : visibleApps(layout).includes("home");
  const menuOpen = useChatStore((s) => s.menuOpen);
  const edge = EDGE[rail?.edge ?? "left"];
  const pendingApprovals = usePendingApprovals();
  const vertical = rail?.edge !== "top" && rail?.edge !== "bottom";

  // Click: open in the focused tile (or show it if open). Shift-click: open in a tile to the right.
  const open = useCallback(
    (key: string, shift = false) => {
      if (key === "chats" && phone) setState(() => ({ pane: "list" }));
      setState(() => ({ menuOpen: false, addOpen: false }));
      openEntry(key, railApp(key), shift && !phone ? "right" : "here");
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
        aria-label={tr("Main")}
        data-part="bar"
        className={cn(
          "bg-bar text-bar-foreground z-50 flex shrink-0 items-center gap-1",
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
          title={t("My apps ({keys})", { keys: `${modLabel(mod)}+H` })}
          aria-label={t("My apps")}
          aria-expanded={menuOpen}
          onClick={() =>
            phone
              ? openAppRef("home")
              : setState((s) => ({ menuOpen: !s.menuOpen, addOpen: false }))
          }
          className={cn(
            "grid size-[30px] shrink-0 place-items-center border font-mono text-[13px] font-semibold transition-colors duration-150",
            menuOpen || (phone && homeOpen)
              ? "border-bar-foreground bg-bar-foreground text-bar"
              : "border-bar-foreground/60 hover:bg-bar-foreground/15",
            vertical ? "md:mb-2.5" : "md:mr-2.5",
          )}
        >
          {tr("A")}
        </button>
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            title={`${item.label}${index < 9 ? ` (${modLabel(mod)}+${index + 1})` : ""}`}
            aria-label={item.label}
            aria-current={item.focused ? "page" : undefined}
            onClick={(e) => open(item.key, e.shiftKey)}
            className={cn(
              "group relative grid size-[38px] shrink-0 place-items-center transition-colors duration-150",
              item.focused
                ? "bg-bar-active text-bar-foreground"
                : "text-bar-foreground/80 hover:bg-bar-foreground/10 hover:text-bar-foreground",
              DESKTOP_ONLY.has(item.key) && "max-md:hidden",
            )}
          >
            <item.icon className="size-[18px]" strokeWidth={1.5} />
            {item.key === "chats" && pendingApprovals > 0 && (
              <span
                className="bg-warning absolute top-1.5 right-1.5 size-2 rounded-full md:hidden"
                title={tr("Approvals waiting")}
              />
            )}
            {item.active && (
              <span
                className={cn(
                  "bg-bar-foreground absolute hidden md:block",
                  edge.mark,
                  !item.focused && "opacity-35",
                )}
              />
            )}
            <span
              className={cn(
                "bg-foreground text-background pointer-events-none absolute z-30 hidden px-2 py-1 font-mono text-[11px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 md:block",
                edge.tip,
              )}
            >
              {item.label}
            </span>
          </button>
        ))}
        <span className={cn("hidden md:block", edge.end)} />
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
    home: { key: "home", label: "My apps", svg: svgOf(LayoutGrid), active: homeOpen },
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

/** The bar's status, like waybar's modules: the clock, the connection, approvals waiting. */
function Status({ vertical }: { vertical: boolean }) {
  const connection = useChatStore((s) => s.connection);
  const pendingApprovals = usePendingApprovals();
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  // A vertical bar is narrow: hours over minutes, 24-hour.
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const openDirect = () => {
    const direct = Object.values(getState().chats).find((c) => c.kind === "direct");
    if (direct) openChat(direct.id);
    else openAppRef("messenger");
  };
  return (
    <div
      className={cn(
        "hidden items-center gap-2 font-mono text-xs font-medium tabular-nums md:flex",
        vertical ? "flex-col" : "flex-row",
      )}
    >
      <span className="text-center leading-tight whitespace-pre" title={now.toLocaleString()}>
        {vertical ? `${hh}\n${mm}` : `${hh}:${mm}`}
      </span>
      <span
        title={
          connection === "open"
            ? t("Connected")
            : connection === "connecting"
              ? t("Connecting…")
              : t("Offline")
        }
        className={cn(
          "size-[7px] rounded-full",
          connection === "open"
            ? "bg-bar-foreground"
            : connection === "connecting"
              ? "bg-warning"
              : "bg-destructive",
        )}
      />
      {pendingApprovals > 0 && (
        <button
          type="button"
          onClick={openDirect}
          title={t("{n} waiting for your decision", { n: pendingApprovals })}
          className="bg-warning grid min-w-5 place-items-center px-1 text-[11px] text-background"
        >
          {pendingApprovals}
        </button>
      )}
    </div>
  );
}

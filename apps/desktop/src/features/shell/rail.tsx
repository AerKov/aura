import { type PageId, visibleApps } from "@aura/shared";
import type { LucideIcon } from "lucide-react";
import { MessagesSquare } from "lucide-react";
import { AuraLogo } from "@/components/logo";
import { setState, useChatStore } from "@/features/chat/store";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { PAGES, railApp, useExtensionApps } from "./apps";
import { openAppRef, phoneAppOf } from "./layout";
import { arrangeRail } from "./rail-layout";
import { useIsPhone } from "./shell";

export interface RailItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Open somewhere on the screen. */
  active: boolean;
}

/** Setup pages stay on the desktop; the phone's tab bar keeps the daily ones. */
const DESKTOP_ONLY = new Set(["integrations", "catalog", "engines", "customize", "devices"]);

const PAGE_ORDER: PageId[] = ["skills", "memory", "agents", "integrations", "catalog", "jobs"];
const PAGE_TAIL: PageId[] = ["engines", "customize", "devices"];

/** Every rail item in its default order, before the user's layout is applied. */
export function useRailItems(): RailItem[] {
  const layout = useChatStore((s) => s.layout);
  const phoneApp = useChatStore(phoneAppOf);
  const phone = useIsPhone();
  const extensions = useExtensionApps();
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
  ];
}

/**
 * Aura's navigation: a slim rail on the left on desktop, a tab bar at the bottom on phones.
 * It opens apps into the shell's tiles (ADR 0024); an item is lit while its app is on screen.
 * The user arranges it on the Customize page (order, hidden items).
 */
export function Rail() {
  const pane = useChatStore((s) => s.pane);
  const connection = useChatStore((s) => s.connection);
  const current = useChatStore(phoneAppOf);
  const rail = useChatStore((s) => s.appearance?.rail);
  const phone = useIsPhone();
  const pendingApprovals = useChatStore(
    (s) =>
      Object.values(s.messages)
        .flat()
        .filter((m) => m.card?.type === "approval" && m.card.status === "pending").length,
  );
  const items = arrangeRail(useRailItems(), rail);

  // Click: open in the focused tile (or show it if open). Shift-click: open in a tile to the right.
  const open = (key: string, shift: boolean) => {
    if (key === "chats" && phone) setState(() => ({ pane: "list" }));
    openAppRef(railApp(key), shift && !phone ? "right" : "here");
  };

  // On phones the tab bar hides inside a conversation, where the composer needs the space.
  const hideOnPhone = current === "messenger" && pane === "main";

  return (
    <nav
      aria-label="Main"
      className={cn(
        "bg-rail text-rail-foreground z-20 flex shrink-0 items-center gap-1 md:border-r max-md:border-t",
        "md:w-14 md:flex-col md:py-2",
        "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:h-16 max-md:justify-around max-md:px-2 max-md:pb-[env(safe-area-inset-bottom)]",
        hideOnPhone && "max-md:hidden",
      )}
    >
      <div className="mb-2 hidden h-10 items-center justify-center md:flex" title="Aura">
        <AuraLogo className="size-8" />
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          title={`${item.label} (Shift-click: open on the right)`}
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          onClick={(e) => open(item.key, e.shiftKey)}
          className={cn(
            "group relative flex size-10 items-center justify-center rounded-xl transition-colors",
            item.active ? "bg-accent text-foreground" : "hover:bg-accent/70 hover:text-foreground",
            item.key === "customize" && "md:mt-auto",
            DESKTOP_ONLY.has(item.key) && "max-md:hidden",
          )}
        >
          <item.icon className="size-5" />
          {item.active && (
            <span className="bg-primary absolute top-1/2 -left-2 hidden h-5 w-1 -translate-y-1/2 rounded-full md:block" />
          )}
          {item.key === "chats" && pendingApprovals > 0 && (
            <span
              className="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full"
              title="Approvals waiting"
            />
          )}
          <span className="bg-foreground text-background pointer-events-none absolute left-12 z-30 hidden rounded-lg px-2 py-1 font-mono text-[11px] whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 md:block">
            {item.label}
          </span>
        </button>
      ))}
      <span
        title={
          connection === "open"
            ? "Connected"
            : connection === "connecting"
              ? "Connecting…"
              : "Offline"
        }
        className={cn(
          "mt-2 hidden size-2 rounded-full md:block",
          connection === "open"
            ? "bg-emerald-400"
            : connection === "connecting"
              ? "bg-amber-400"
              : "bg-rose-500",
        )}
      />
    </nav>
  );
}

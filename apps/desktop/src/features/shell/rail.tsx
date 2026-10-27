import type { LucideIcon } from "lucide-react";
import { Blocks, CalendarClock, MessagesSquare, Palette, Smartphone, Sparkles } from "lucide-react";
import {
  showCustomize,
  showDevices,
  showExtension,
  showJobs,
  showList,
  showSkills,
} from "@/features/chat/actions";
import { setState, useChatStore } from "@/features/chat/store";
import { cn } from "@/lib/utils";

interface Item {
  key: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}

/**
 * Aura's navigation: a slim rail on the left on desktop, a tab bar at the bottom on phones.
 * Conversations are one place among others (skills, schedule, customize, devices, panels).
 */
export function Rail() {
  const view = useChatStore((s) => s.view);
  const pane = useChatStore((s) => s.pane);
  const connection = useChatStore((s) => s.connection);
  const customize = useChatStore((s) => s.customize);
  const pendingApprovals = useChatStore(
    (s) =>
      Object.values(s.messages)
        .flat()
        .filter((m) => m.card?.type === "approval" && m.card.status === "pending").length,
  );
  const panels = customize?.safeMode.on
    ? []
    : (customize?.extensions ?? []).filter((e) => e.enabled && e.permissions.includes("ui.panel"));

  const items: Item[] = [
    {
      key: "chats",
      label: "Chats",
      icon: MessagesSquare,
      active: view === "chat",
      onClick: () => {
        setState(() => ({ view: "chat" }));
        showList();
      },
    },
    {
      key: "skills",
      label: "Skills",
      icon: Sparkles,
      active: view === "skills",
      onClick: showSkills,
    },
    {
      key: "jobs",
      label: "Schedule",
      icon: CalendarClock,
      active: view === "jobs",
      onClick: showJobs,
    },
    ...panels.map((ext) => ({
      key: `ext:${ext.id}`,
      label: ext.name,
      icon: Blocks,
      active: view === `ext:${ext.id}`,
      onClick: () => showExtension(ext.id),
    })),
    {
      key: "customize",
      label: "Customize",
      icon: Palette,
      active: view === "customize",
      onClick: showCustomize,
    },
    {
      key: "devices",
      label: "Devices",
      icon: Smartphone,
      active: view === "devices",
      onClick: showDevices,
    },
  ];

  // On phones the tab bar hides inside a conversation, where the composer needs the space.
  const hideOnPhone = view === "chat" && pane === "main";

  return (
    <nav
      aria-label="Main"
      className={cn(
        "bg-rail text-rail-foreground z-20 flex shrink-0 items-center gap-1",
        "md:w-16 md:flex-col md:py-3",
        "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:h-16 max-md:justify-around max-md:px-2 max-md:pb-[env(safe-area-inset-bottom)]",
        hideOnPhone && "max-md:hidden",
      )}
    >
      <div className="mb-3 hidden flex-col items-center md:flex" title="Aura">
        <span className="aura-fill block size-8 rounded-full shadow-[0_0_18px_-2px_var(--aura-1)]" />
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          onClick={item.onClick}
          className={cn(
            "group relative flex size-11 items-center justify-center rounded-xl transition-colors",
            item.active ? "bg-white/12 text-white" : "hover:bg-white/8 hover:text-white",
            item.key === "customize" && "md:mt-auto",
          )}
        >
          <item.icon className="size-5" />
          {item.active && (
            <span className="aura-fill absolute top-1/2 -left-2.5 hidden h-6 w-1 -translate-y-1/2 rounded-full md:block" />
          )}
          {item.key === "chats" && pendingApprovals > 0 && (
            <span
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-400"
              title="Approvals waiting"
            />
          )}
          <span className="pointer-events-none absolute left-14 z-30 hidden rounded-md bg-black/80 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 md:block">
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

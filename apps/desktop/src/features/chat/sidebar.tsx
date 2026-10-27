import { CalendarClock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { showJobs, showSkills } from "./actions";
import { ChatList } from "./chat-list";
import { useChatStore } from "./store";

export function Sidebar() {
  const connection = useChatStore((s) => s.connection);
  const version = useChatStore((s) => s.serverVersion);
  const me = useChatStore((s) => s.me);
  const view = useChatStore((s) => s.view);

  return (
    <aside className="bg-sidebar flex w-80 shrink-0 flex-col border-r max-md:w-64">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-lg font-semibold tracking-tight">aura</span>
        <span className="text-muted-foreground truncate text-xs">{me?.name}</span>
      </div>
      <ChatList />
      <div className="mx-2 mb-2 space-y-0.5">
        <NavButton
          active={view === "skills"}
          onClick={showSkills}
          icon={<Sparkles className="size-4" />}
        >
          Skills
        </NavButton>
        <NavButton
          active={view === "jobs"}
          onClick={showJobs}
          icon={<CalendarClock className="size-4" />}
        >
          Schedule
        </NavButton>
      </div>
      <footer className="text-muted-foreground flex items-center gap-2 border-t px-4 py-2 text-xs">
        <span
          className={cn(
            "size-2 rounded-full",
            connection === "open"
              ? "bg-emerald-500"
              : connection === "connecting"
                ? "bg-amber-500"
                : "bg-rose-500",
          )}
        />
        {connection === "open"
          ? `Connected · server v${version}`
          : connection === "connecting"
            ? "Connecting…"
            : "Offline, retrying…"}
      </footer>
    </aside>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm",
        active ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      {icon} {children}
    </button>
  );
}

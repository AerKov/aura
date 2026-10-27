import { cn } from "@/lib/utils";
import { ChatList } from "./chat-list";
import { useChatStore } from "./store";

export function Sidebar() {
  const connection = useChatStore((s) => s.connection);
  const version = useChatStore((s) => s.serverVersion);
  const me = useChatStore((s) => s.me);

  return (
    <aside className="bg-sidebar flex w-80 shrink-0 flex-col border-r max-md:w-64">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-lg font-semibold tracking-tight">crew</span>
        <span className="text-muted-foreground truncate text-xs">{me?.name}</span>
      </div>
      <ChatList />
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

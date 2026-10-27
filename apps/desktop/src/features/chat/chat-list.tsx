import { cn } from "@/lib/utils";
import { openChat } from "./actions";
import { ChatAvatar } from "./avatar";
import { formatListTime } from "./participants";
import { useChatStore } from "./store";

export function ChatList() {
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const sorted = Object.values(chats).sort((a, b) =>
    (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
  );

  return (
    <nav className="flex-1 overflow-y-auto p-2">
      {sorted.map((chat) => (
        <button
          key={chat.id}
          type="button"
          onClick={() => openChat(chat.id)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
            chat.id === activeChatId ? "bg-accent" : "hover:bg-accent/60",
          )}
        >
          <ChatAvatar kind={chat.kind} title={chat.title} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{chat.title}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatListTime(chat.lastMessageAt)}
              </span>
            </div>
            <p className="text-muted-foreground truncate text-sm">
              {chat.lastMessagePreview ?? "No messages yet"}
            </p>
          </div>
        </button>
      ))}
    </nav>
  );
}

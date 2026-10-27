import type { Chat } from "@aura/shared";
import { cn } from "@/lib/utils";
import { openChat } from "./actions";
import { ChatMark } from "./chat-mark";
import { formatListTime } from "./participants";
import { useChatStore } from "./store";

const SECTIONS: { kind: Chat["kind"]; label: string }[] = [
  { kind: "direct", label: "Orchestrator" },
  { kind: "group", label: "Projects" },
  { kind: "system", label: "Signals" },
];

/** Conversations, grouped: the orchestrator, projects, and system signals. */
export function Sidebar() {
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const view = useChatStore((s) => s.view);
  const pane = useChatStore((s) => s.pane);
  const me = useChatStore((s) => s.me);
  const connection = useChatStore((s) => s.connection);
  const working = useChatStore((s) => {
    const ids: string[] = [];
    for (const [chatId, list] of Object.entries(s.messages))
      if (list.some((m) => m.status === "streaming")) ids.push(chatId);
    return ids.sort().join(",");
  });

  const sorted = Object.values(chats).sort((a, b) =>
    (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
  );

  return (
    <aside
      className={cn(
        "bg-sidebar flex w-80 shrink-0 flex-col border-r max-md:w-full max-md:pb-16",
        view !== "chat" && "md:hidden",
        (pane === "main" || view !== "chat") && "max-md:hidden",
      )}
    >
      <header className="flex h-14 items-center justify-between border-b px-4">
        <h1 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="bg-primary inline-block size-2.5 rounded-full" />
          aura
        </h1>
        <span className="kicker">
          {connection === "open"
            ? me?.name
            : connection === "connecting"
              ? "connecting"
              : "offline"}
        </span>
      </header>
      <nav className="flex-1 overflow-y-auto pb-3">
        {SECTIONS.map(({ kind, label }) => {
          const group = sorted.filter((c) => c.kind === kind);
          if (group.length === 0) return null;
          return (
            <section key={kind}>
              <h2 className="kicker px-4 pt-4 pb-1.5">{label}</h2>
              {group.map((chat) => {
                const active = chat.id === activeChatId;
                const busy = working.split(",").includes(chat.id);
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => openChat(chat.id)}
                    className={cn(
                      "relative mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                      active ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                                        <ChatMark chat={chat} size="md" working={busy} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-medium">{chat.title}</span>
                        <span className="text-muted-foreground shrink-0 font-mono text-[10.5px]">
                          {formatListTime(chat.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate text-[13px]">
                        {busy ? (
                          <span className="text-primary font-mono text-xs">● working</span>
                        ) : (
                          (chat.lastMessagePreview ?? "Nothing yet")
                        )}
                      </p>
                    </div>
                  </button>
                );
              })}
            </section>
          );
        })}
      </nav>
    </aside>
  );
}

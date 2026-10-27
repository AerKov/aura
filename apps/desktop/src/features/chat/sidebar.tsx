import type { Chat } from "@aura/shared";
import { cn } from "@/lib/utils";
import { openChat } from "./actions";
import { ChatOrb } from "./chat-orb";
import { formatListTime } from "./participants";
import { useChatStore } from "./store";

const SECTIONS: { kind: Chat["kind"]; label: string }[] = [
  { kind: "direct", label: "With you" },
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
  const streamingChats = useChatStore((s) => {
    const ids = new Set<string>();
    for (const [chatId, list] of Object.entries(s.messages))
      if (list.some((m) => m.status === "streaming")) ids.add(chatId);
    return [...ids].sort().join(",");
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
      <header className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          <span className="aura-text">aura</span>
        </h1>
        <span className="text-muted-foreground truncate text-xs">
          {connection === "open"
            ? me?.name
            : connection === "connecting"
              ? "connecting…"
              : "offline"}
        </span>
      </header>
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {SECTIONS.map(({ kind, label }) => {
          const group = sorted.filter((c) => c.kind === kind);
          if (group.length === 0) return null;
          return (
            <section key={kind} className="mb-3">
              <h2 className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-medium tracking-wider uppercase">
                {label}
              </h2>
              {group.map((chat) => {
                const active = chat.id === activeChatId;
                const working = streamingChats.split(",").includes(chat.id);
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => openChat(chat.id)}
                    className={cn(
                      "relative flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors",
                      active ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    {active && (
                      <span className="aura-fill absolute top-3 bottom-3 -left-1 w-1 rounded-full" />
                    )}
                    <ChatOrb chat={chat} size="md" active={working} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{chat.title}</span>
                        <span className="text-muted-foreground shrink-0 text-[11px]">
                          {formatListTime(chat.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate text-[13px]">
                        {working ? (
                          <span className="aura-text font-medium">working…</span>
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

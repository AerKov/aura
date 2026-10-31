import type { Chat } from "@aura/shared";
import { useT } from "@/features/localization/i18n";
import { cn } from "@/lib/utils";
import { openChat } from "./actions";
import { ChatMark } from "./chat-mark";
import { NewGroupButton } from "./new-group";
import { agentName, chatTitle, formatListTime } from "./participants";
import { useChatStore } from "./store";

type Section = "direct" | "groups" | "apps" | "system";

const SECTIONS: { key: Section; label: string | null }[] = [
  { key: "direct", label: null },
  { key: "groups", label: "Groups" },
  { key: "apps", label: "Apps" },
  { key: "system", label: "Alerts" },
];

/**
 * The chat list (ADR 0034): the Helper's chat pinned on top, then your groups (with or without a
 * folder), apps and alerts. A row
 * says who is working right now and how many decisions wait in it.
 */
export function Sidebar() {
  const t = useT();
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const pane = useChatStore((s) => s.pane);
  const projects = useChatStore((s) => s.projects);
  const agents = useChatStore((s) => s.agents);
  // An app's chat is a group whose folder is an app (ADR 0024); a project is a group with a
  // folder (ADR 0039), listed with the other groups.
  const sectionOf = (chat: Chat): Section =>
    chat.kind === "group"
      ? chat.projectId && projects[chat.projectId]?.kind === "app"
        ? "apps"
        : "groups"
      : chat.kind;
  // Who is writing a reply in each chat right now, and the decisions waiting there.
  const working = useChatStore((s) => {
    const out: string[] = [];
    for (const [chatId, list] of Object.entries(s.messages)) {
      const streaming = list.find((m) => m.status === "streaming" && m.author.kind === "agent");
      if (streaming) out.push(`${chatId}=${streaming.author.id}`);
    }
    return out.sort().join(",");
  });
  const waiting = useChatStore((s) => {
    const out: string[] = [];
    for (const [chatId, list] of Object.entries(s.messages)) {
      const n = list.filter(
        (m) => m.card?.type === "approval" && m.card.status === "pending",
      ).length;
      if (n > 0) out.push(`${chatId}=${n}`);
    }
    return out.join(",");
  });
  const workerOf = (chatId: string) =>
    working
      .split(",")
      .find((x) => x.startsWith(`${chatId}=`))
      ?.slice(chatId.length + 1);
  const waitingIn = (chatId: string) =>
    Number(
      waiting
        .split(",")
        .find((x) => x.startsWith(`${chatId}=`))
        ?.slice(chatId.length + 1) ?? 0,
    );

  const sorted = Object.values(chats).sort((a, b) =>
    (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
  );

  return (
    <aside
      aria-label={t("Chats")}
      data-part="chat-list"
      className={cn(
        "bg-chat-list flex w-[clamp(220px,32%,290px)] shrink-0 flex-col border-r @max-[640px]:w-full",
        pane === "main" && "@max-[640px]:hidden",
      )}
    >
      <NewGroupButton />
      <nav className="flex-1 overflow-y-auto pb-3">
        {SECTIONS.map(({ key, label }) => {
          const group = sorted.filter((c) => sectionOf(c) === key);
          if (group.length === 0) return null;
          return (
            <section key={key}>
              {label && (
                <h2 className="text-muted-foreground px-3.5 pt-4 pb-1 text-[12.5px] font-medium">
                  {t(label)}
                </h2>
              )}
              {group.map((chat) => {
                const active = chat.id === activeChatId;
                const worker = workerOf(chat.id);
                const decisions = waitingIn(chat.id);
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => openChat(chat.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "relative flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors duration-150",
                      active
                        ? "bg-accent text-accent-foreground shadow-[inset_2px_0_0_var(--ring)]"
                        : "hover:bg-foreground/[0.05]",
                    )}
                  >
                    <ChatMark chat={chat} size="md" working={Boolean(worker)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14.5px] font-medium">
                          {chatTitle(chat, t)}
                        </span>
                        <span className="text-muted-foreground shrink-0 font-mono text-[10.5px]">
                          {formatListTime(chat.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">
                          {worker ? (
                            <span className="text-signal-text">
                              {t("{name} is working…", {
                                name: agentName(worker, agents[worker]?.name, t),
                              })}
                            </span>
                          ) : (
                            (chat.lastMessagePreview ?? t("Nothing yet"))
                          )}
                        </p>
                        {decisions > 0 && (
                          <span
                            title={t("{n} waiting for your decision", { n: decisions })}
                            className="bg-primary text-primary-foreground grid min-w-[18px] place-items-center px-1 font-mono text-[11px]"
                          >
                            {decisions}
                          </span>
                        )}
                      </div>
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

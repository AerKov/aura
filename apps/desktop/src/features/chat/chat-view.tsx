import type { Message } from "@aura/shared";
import { Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AuraLogo } from "@/components/logo";
import { useT } from "@/features/localization/i18n";
import { loadMembers, loadMessages, reportError } from "./actions";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { isGrouped } from "./message-utils";
import { agentName } from "./participants";
import { SetupPanel } from "./setup-panel";
import { getState, useChatStore } from "./store";

const EMPTY: Message[] = [];

/**
 * A chat (ADR 0042): the Helper's, or an app's beside the app. Messages and a composer; nothing
 * else. `inApp`: the panel next to its app, with a short header.
 */
export function ChatView({ chatId, inApp = false }: { chatId: string; inApp?: boolean }) {
  const chat = useChatStore((s) => s.chats[chatId]);
  const messages = useChatStore((s) => s.messages[chatId] ?? EMPTY);
  // Until the messages arrive the chat is not known to be empty: no greeting flashes by.
  const loaded = useChatStore((s) => chatId in s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const agentList = useChatStore((s) => s.agents);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const t = useT();
  const agentNames = useMemo(
    () =>
      Object.fromEntries(
        Object.values(agentList).map((a) => [a.handle, agentName(a.handle, a.name, t)]),
      ),
    [agentList, t],
  );

  useEffect(() => {
    if (!getState().messages[chatId]) void loadMessages(chatId).catch(reportError);
    // Who is in the chat decides who answers a plain message (ADR 0014, 0042).
    if (!getState().members[chatId]) void loadMembers(chatId).catch(reportError);
  }, [chatId]);

  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // Keep the view pinned to the newest message unless the user scrolled up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when content changes
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);
  const onScroll = () => {
    const el = scroller.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  const jumpTo = (messageId: string) => {
    const el = document.getElementById(`m-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
  };

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  // What was there when the chat opened (or first loaded) shows at once; only newer messages
  // slide in. Re-animating the whole history on every visit made the screen look like it blinked.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null && (messages.length > 0 || getState().messages[chatId]))
    seen.current = new Set(messages.map((m) => m.id));
  const working = messages.filter((m) => m.status === "streaming").map((m) => m.author.id);
  if (!chat) return null;
  const direct = chat.kind === "direct";

  return (
    <section data-part="chat" className="chat-bg flex min-h-0 min-w-0 flex-1 flex-col">
      {inApp && (
        <header className="flex min-h-[52px] items-center gap-2 border-b px-4">
          <Sparkles className="text-primary size-4" />
          <h2 className="flex-1 text-[15px] font-semibold">{t("Change this app")}</h2>
          {working.length > 0 && (
            <span className="text-signal-text animate-pulse text-xs">
              {t("{name} is working…", {
                name: working.map((h) => agentNames[h] ?? h).join(", "),
              })}
            </span>
          )}
        </header>
      )}
      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-[760px] pb-4">
          {loaded && messages.length === 0 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 mx-auto mt-[14vh] max-w-sm text-center duration-700">
              <AuraLogo alive className="mx-auto mb-6 size-24 shadow-lg" />
              <h2 className="mb-2 text-2xl">
                {direct ? t("What shall we build?") : t("Say what this app should do")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {direct
                  ? t(
                      "Describe an app in your own words: a tracker, a board, a small CRM. Your Helper makes it, and you change it by chatting.",
                    )
                  : t("@builder changes the app; you see every change and approve it.")}
              </p>
            </div>
          )}
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              replyTarget={message.replyTo ? byId.get(message.replyTo) : undefined}
              showAuthor={!isGrouped(messages[index - 1], message)}
              onReply={setReplyTo}
              onJumpTo={jumpTo}
              fresh={seen.current !== null && !seen.current.has(message.id)}
            />
          ))}
        </div>
      </div>
      {direct && <SetupPanel />}
      <Composer
        chatId={chatId}
        chatKind={chat.kind}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        placeholder={
          direct
            ? t("Write to {name}…", { name: agentNames.orchestrator ?? t("Helper") })
            : t("Write what to change…")
        }
      />
    </section>
  );
}

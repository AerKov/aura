import type { Message } from "@crew/shared";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatAvatar } from "./avatar";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { isGrouped } from "./message-utils";
import { chatSubtitle } from "./participants";
import { SetupPanel } from "./setup-panel";
import { useChatStore } from "./store";

const EMPTY: Message[] = [];

export function ChatView({ chatId }: { chatId: string }) {
  const chat = useChatStore((s) => s.chats[chatId]);
  const messages = useChatStore((s) => s.messages[chatId] ?? EMPTY);
  const streaming = useChatStore((s) => s.streaming);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const typing = messages.some((m) => m.status === "streaming");
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

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

  if (!chat) return null;

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <ChatAvatar kind={chat.kind} title={chat.title} />
        <div>
          <h1 className="font-semibold">{chat.title}</h1>
          <p className="text-muted-foreground text-xs">
            {typing ? (
              <span className="text-sky-600 dark:text-sky-400">typing…</span>
            ) : (
              chatSubtitle(chat)
            )}
          </p>
        </div>
      </header>
      <div ref={scroller} onScroll={onScroll} className="chat-bg flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto max-w-4xl">
          {messages.length === 0 && (
            <p className="text-muted-foreground mt-10 text-center text-sm">
              No messages yet. Say hi!
            </p>
          )}
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              replyTarget={message.replyTo ? byId.get(message.replyTo) : undefined}
              showAuthor={!isGrouped(messages[index - 1], message)}
              onReply={setReplyTo}
              onJumpTo={jumpTo}
            />
          ))}
        </div>
      </div>
      {chat.kind === "direct" && <SetupPanel />}
      <Composer chatId={chatId} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
    </section>
  );
}

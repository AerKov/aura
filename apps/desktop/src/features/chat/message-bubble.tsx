import type { Message } from "@crew/shared";
import { Reply } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { displayName, formatTime, previewOf } from "./message-utils";
import { useChatStore } from "./store";

export function MessageBubble({
  message,
  replyTarget,
  showAuthor,
  onReply,
  onJumpTo,
}: {
  message: Message;
  replyTarget: Message | undefined;
  showAuthor: boolean;
  onReply: (message: Message) => void;
  onJumpTo: (messageId: string) => void;
}) {
  const me = useChatStore((s) => s.me);
  const streamingText = useChatStore((s) => s.streaming[message.id]);
  const mine = message.author.kind === "user" && message.author.id === me?.id;
  const name = displayName(message.author, me);
  const body = message.status === "streaming" ? (streamingText ?? message.body) : message.body;

  if (message.kind === "system") {
    return (
      <div className="text-muted-foreground my-2 text-center text-xs">
        <span className="bg-muted rounded-full px-3 py-1">{message.body}</span>
      </div>
    );
  }

  return (
    <div
      id={`m-${message.id}`}
      className={cn(
        "group flex items-end gap-2",
        mine ? "flex-row-reverse" : "flex-row",
        showAuthor ? "mt-3" : "mt-1",
      )}
    >
      {!mine && (showAuthor ? <Avatar name={name} size="sm" /> : <div className="w-8 shrink-0" />)}
      <div
        className={cn(
          "relative max-w-[min(42rem,80%)] min-w-0 rounded-2xl px-3 py-2 shadow-xs",
          mine ? "bg-sky-100 dark:bg-sky-900/50" : "bg-card border",
          message.status === "error" && "border-destructive",
        )}
      >
        {showAuthor && !mine && (
          <div className="mb-0.5 text-sm font-medium text-sky-700 dark:text-sky-400">{name}</div>
        )}
        {replyTarget && (
          <button
            type="button"
            onClick={() => onJumpTo(replyTarget.id)}
            className="mb-1 block w-full rounded border-l-2 border-sky-500 bg-black/5 px-2 py-1 text-left text-xs dark:bg-white/5"
          >
            <span className="font-medium">{displayName(replyTarget.author, me)}</span>
            <span className="text-muted-foreground line-clamp-1">{previewOf(replyTarget)}</span>
          </button>
        )}
        {body ? (
          <Markdown streaming={message.status === "streaming"}>{body}</Markdown>
        ) : (
          message.status === "streaming" && <TypingDots />
        )}
        {message.error && <p className="text-destructive mt-1 text-sm">{message.error}</p>}
        <div className="text-muted-foreground mt-0.5 flex justify-end gap-2 text-[11px]">
          {message.usage && (
            <span
              title={`${message.usage.inputTokens} in / ${message.usage.outputTokens} out tokens`}
            >
              {message.usage.costUsd !== null
                ? `$${message.usage.costUsd.toFixed(4)}`
                : `${message.usage.outputTokens} tok`}
            </span>
          )}
          <span>{formatTime(message.createdAt)}</span>
        </div>
      </div>
      <button
        type="button"
        aria-label="Reply"
        onClick={() => onReply(message)}
        className="text-muted-foreground hover:text-foreground mb-2 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Reply className="size-4" />
      </button>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-2" role="status" aria-label="typing">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="bg-muted-foreground size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

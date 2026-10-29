import type { Message } from "@aura/shared";
import { formatTokens } from "@aura/shared";
import { ArrowRightLeft, CornerDownRight, Reply, Square } from "lucide-react";
import { Mark } from "@/components/mark";
import { Markdown } from "@/components/markdown";
import { highlightMentions } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { reportError, stopRun } from "./actions";
import { AlertCard } from "./alert-card";
import { ApprovalCard } from "./approval-card";
import { displayName, formatTime, previewOf } from "./message-utils";
import { RunCard } from "./run-card";
import { useChatStore } from "./store";
import { TaskCard } from "./task-card";

/**
 * One message in Aura's conversation layout: agents write full-width prose next to their mark; the
 * user's own messages are compact notes on the right; system events are quiet dividers.
 */
export function MessageBubble({
  message,
  replyTarget,
  showAuthor,
  onReply,
  onJumpTo,
  onMove,
}: {
  message: Message;
  replyTarget: Message | undefined;
  showAuthor: boolean;
  onReply: (message: Message) => void;
  onJumpTo: (messageId: string) => void;
  /** Offered when the chat has topics: put the message in another topic. */
  onMove?: (message: Message) => void;
}) {
  const me = useChatStore((s) => s.me);
  const streamingText = useChatStore((s) => s.streaming[message.id]);
  const mine = message.author.kind === "user" && message.author.id === me?.id;
  const name = displayName(message.author, me);
  const streaming = message.status === "streaming";
  const body = streaming ? (streamingText ?? message.body) : message.body;

  if (message.kind === "system") {
    return (
      <div className="text-muted-foreground my-4 flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" />
        <span className="max-w-[80%] text-center">{message.body}</span>
        <span className="bg-border h-px flex-1" />
      </div>
    );
  }

  const reply = replyTarget && (
    <button
      type="button"
      onClick={() => onJumpTo(replyTarget.id)}
      className="text-muted-foreground hover:text-foreground mb-1 flex max-w-full items-center gap-1.5 text-xs"
    >
      <CornerDownRight className="size-3.5 shrink-0" />
      <span className="font-medium">{displayName(replyTarget.author, me)}</span>
      <span className="truncate opacity-80">{previewOf(replyTarget)}</span>
    </button>
  );

  const action =
    "text-muted-foreground hover:text-foreground bg-background/80 rounded-pill border p-1 shadow-sm";
  const replyButton = (
    <div className="absolute -top-3 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {onMove && (
        <button
          type="button"
          aria-label="Move to another topic"
          title="Move to another topic"
          onClick={() => onMove(message)}
          className={action}
        >
          <ArrowRightLeft className="size-3.5" />
        </button>
      )}
      <button type="button" aria-label="Reply" onClick={() => onReply(message)} className={action}>
        <Reply className="size-3.5" />
      </button>
    </div>
  );

  if (mine) {
    return (
      <div
        id={`m-${message.id}`}
        className={cn("group message-in flex flex-col items-end", showAuthor ? "mt-5" : "mt-1.5")}
      >
        {reply}
        <div className="relative max-w-[min(36rem,85%)] rounded-2xl rounded-br-md bg-[var(--bubble-own)] px-3.5 py-2">
          {replyButton}
          <Markdown>{highlightMentions(body)}</Markdown>
        </div>
        {showAuthor && (
          <span className="text-muted-foreground mt-1 mr-1 text-[11px]">
            {formatTime(message.createdAt)}
          </span>
        )}
      </div>
    );
  }

  const kind =
    message.author.kind === "agent" && message.author.id === "orchestrator"
      ? "orchestrator"
      : message.author.kind === "bot"
        ? message.author.id.startsWith("monitor")
          ? "alert"
          : "bot"
        : "agent";

  return (
    <div
      id={`m-${message.id}`}
      className={cn("group message-in relative flex gap-3", showAuthor ? "mt-5" : "mt-1")}
    >
      <div className="w-8 shrink-0 pt-0.5">
        {showAuthor && <Mark name={message.author.id} kind={kind} size="md" working={streaming} />}
      </div>
      <div className="min-w-0 flex-1 bg-[var(--bubble-other)]">
        {showAuthor && (
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-[14px] font-semibold">{name}</span>
            <span className="kicker">
              {message.author.kind === "agent" ? `@${message.author.id} · ` : ""}
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}
        {reply}
        <div className="relative max-w-[46rem]">
          {replyButton}
          {body ? (
            <Markdown streaming={streaming}>{highlightMentions(body)}</Markdown>
          ) : (
            streaming && <Thinking />
          )}
          {message.card?.type === "run" && <RunCard card={message.card} />}
          {message.card?.type === "approval" && <ApprovalCard card={message.card} />}
          {message.card?.type === "task" && <TaskCard card={message.card} />}
          {message.card?.type === "alert" && <AlertCard card={message.card} />}
          {message.error && <p className="text-destructive mt-1 text-sm">{message.error}</p>}
          {(message.usage || (streaming && message.runId)) && (
            <div className="text-muted-foreground mt-1 flex items-center gap-3 text-[11px]">
              {streaming && message.runId && (
                <button
                  type="button"
                  onClick={() => void stopRun(message.runId ?? "").catch(reportError)}
                  className="hover:text-foreground inline-flex items-center gap-1"
                >
                  <Square className="size-3 fill-current" /> Stop
                </button>
              )}
              {message.usage && (
                <span
                  title={`${message.usage.inputTokens} in / ${message.usage.outputTokens} out tokens${
                    message.usage.costUsd !== null
                      ? ` · ≈ $${message.usage.costUsd.toFixed(4)} at API prices (a subscription is not billed this)`
                      : ""
                  }`}
                >
                  {formatTokens(message.usage.inputTokens + message.usage.outputTokens)} tokens
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <span
      className="inline-flex items-center gap-2 py-1 text-sm"
      role="status"
      aria-label="thinking"
    >
      <span className="text-primary font-mono text-xs tracking-wider uppercase">working</span>
      <span className="inline-flex gap-1">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="bg-primary size-1.5 animate-pulse rounded-full"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </span>
  );
}

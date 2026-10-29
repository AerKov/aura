import type { Message } from "@aura/shared";
import { formatTokens } from "@aura/shared";
import { ArrowRightLeft, CornerDownRight, Reply, Square } from "lucide-react";
import { Mark } from "@/components/mark";
import { Markdown } from "@/components/markdown";
import { useT } from "@/features/localization/i18n";
import { useAdvanced } from "@/features/shell/launcher";
import { highlightMentions } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { openAgentSettings, reportError, stopRun } from "./actions";
import { AlertCard } from "./alert-card";
import { ApprovalCard } from "./approval-card";
import { Attachments } from "./attachments";
import { displayName, formatTime, previewOf } from "./message-utils";
import { agentName as agentNameOf } from "./participants";
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
  const advanced = useAdvanced();
  const t = useT();
  const streamingText = useChatStore((s) => s.streaming[message.id]);
  const mine = message.author.kind === "user" && message.author.id === me?.id;
  // Agents go by their profile's name ("Builder"); the handle shows in advanced places.
  const profileName = useChatStore((s) =>
    message.author.kind === "agent" ? s.agents[message.author.id]?.name : undefined,
  );
  const name =
    message.author.kind === "agent"
      ? agentNameOf(message.author.id, profileName, t)
      : displayName(message.author, me);
  const streaming = message.status === "streaming";
  const body = streaming ? (streamingText ?? message.body) : message.body;

  if (message.kind === "system") {
    return (
      <p className="text-muted-foreground mx-auto my-3 max-w-[80%] text-center text-xs">
        {message.body}
      </p>
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

  const action = "text-muted-foreground hover:text-foreground bg-card border p-1";
  const replyButton = (
    <div className="absolute -top-3 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {onMove && (
        <button
          type="button"
          aria-label={t("Move to another topic")}
          title={t("Move to another topic")}
          onClick={() => onMove(message)}
          className={action}
        >
          <ArrowRightLeft className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-label={t("Reply")}
        onClick={() => onReply(message)}
        className={action}
      >
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
        <div className="bg-bubble-own text-bubble-own-foreground relative max-w-[min(36rem,85%)] rounded-lg px-3 py-2 text-[14.5px] leading-[1.45]">
          {replyButton}
          {body && <Markdown>{highlightMentions(body)}</Markdown>}
          <Attachments chatId={message.chatId} files={message.attachments} />
        </div>
        {showAuthor && (
          <span className="text-muted-foreground mt-1 font-mono text-[11px]">
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
      <div className="w-[26px] shrink-0 pt-0.5">
        {showAuthor &&
          (message.author.kind === "agent" ? (
            <button
              type="button"
              aria-label={t("Settings of {name}", { name })}
              title={t("Settings of {name}", { name })}
              onClick={() => openAgentSettings(message.author.id)}
            >
              <Mark name={message.author.id} label={name} kind={kind} size="sm" />
            </button>
          ) : (
            <Mark name={message.author.id} label={name} kind={kind} size="sm" />
          ))}
      </div>
      <div className="min-w-0 flex-1">
        {showAuthor && (
          <div className="mb-0.5 flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">{name}</span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {advanced && message.author.kind === "agent" ? `@${message.author.id} · ` : ""}
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}
        {reply}
        <div className="relative max-w-[46rem]">
          {replyButton}
          {body && <Markdown streaming={streaming}>{highlightMentions(body)}</Markdown>}
          <Attachments chatId={message.chatId} files={message.attachments} />
          {streaming && (
            <span
              role="status"
              aria-label={t("writing")}
              className="bg-signal mt-1 inline-block h-[15px] w-[7px] animate-pulse align-middle"
            />
          )}
          {message.card?.type === "run" && (
            <RunCard
              card={message.card}
              name={name}
              usage={
                message.usage
                  ? {
                      tokens: message.usage.inputTokens + message.usage.outputTokens,
                      costUsd: message.usage.costUsd,
                    }
                  : null
              }
              onStop={
                message.runId
                  ? () => void stopRun(message.runId ?? "").catch(reportError)
                  : undefined
              }
            />
          )}
          {message.card?.type === "approval" && <ApprovalCard card={message.card} name={name} />}
          {message.card?.type === "task" && <TaskCard card={message.card} />}
          {message.card?.type === "alert" && <AlertCard card={message.card} />}
          {message.error && <p className="text-destructive mt-1 text-sm">{message.error}</p>}
          {message.card?.type !== "run" && (message.usage || (streaming && message.runId)) && (
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

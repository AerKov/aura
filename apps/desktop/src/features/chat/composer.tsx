import type { Message } from "@aura/shared";
import { ArrowUp, CornerDownRight, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { reportError, sendMessage } from "./actions";
import { displayName, previewOf } from "./message-utils";
import { useChatStore } from "./store";

/** A floating command bar: write markdown, @mention agents, reply to a message. */
export function Composer({
  chatId,
  replyTo,
  onCancelReply,
  placeholder = "Message · @ to call an agent",
}: {
  chatId: string;
  replyTo: Message | null;
  onCancelReply: () => void;
  placeholder?: string;
}) {
  const me = useChatStore((s) => s.me);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(chatId, body, replyTo?.id ?? null);
      setText("");
      onCancelReply();
    } catch (err) {
      reportError(err);
      setError(err instanceof Error ? err.message : "Could not send the message");
    } finally {
      setSending(false);
      ref.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
    if (event.key === "Escape" && replyTo) onCancelReply();
  };

  return (
    <div className="px-4 pt-2 pb-4 max-md:px-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl">
        {error && <p className="text-destructive mb-2 px-2 text-sm">{error}</p>}
        <div className="bg-card focus-within:border-primary/60 focus-within:ring-primary/15 rounded-lg border shadow-sm transition-shadow focus-within:ring-4">
          {replyTo && (
            <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
              <CornerDownRight className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{displayName(replyTo.author, me)}</span>
                <span className="text-muted-foreground ml-2 truncate">{previewOf(replyTo)}</span>
              </div>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={onCancelReply}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 p-2 pl-4">
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              className="placeholder:text-muted-foreground field-sizing-content max-h-48 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none"
            />
            <button
              type="button"
              aria-label="Send"
              disabled={!text.trim() || sending}
              onClick={() => void send()}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md transition-colors",
                text.trim()
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
        <div className="kicker mt-1.5 flex gap-4 px-1 max-md:hidden">
          <span>⏎ send</span>
          <span>⇧⏎ new line</span>
          <span>@ call an agent</span>
          <span>markdown</span>
        </div>
      </div>
    </div>
  );
}

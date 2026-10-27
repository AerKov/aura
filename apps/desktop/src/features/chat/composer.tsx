import type { Message } from "@aura/shared";
import { SendHorizontal, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { reportError, sendMessage } from "./actions";
import { displayName, previewOf } from "./message-utils";
import { useChatStore } from "./store";

export function Composer({
  chatId,
  replyTo,
  onCancelReply,
}: {
  chatId: string;
  replyTo: Message | null;
  onCancelReply: () => void;
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
    <div className="bg-background border-t p-3">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-sky-500 bg-sky-50 px-2 py-1 text-sm dark:bg-sky-950/40">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sky-700 dark:text-sky-400">
              Reply to {displayName(replyTo.author, me)}
            </div>
            <div className="text-muted-foreground truncate">{previewOf(replyTo)}</div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Cancel reply" onClick={onCancelReply}>
            <X />
          </Button>
        </div>
      )}
      {error && <p className="text-destructive mb-2 text-sm">{error}</p>}
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message (Markdown, Shift+Enter for a new line)"
          className="max-h-48 min-h-10 resize-none"
          rows={1}
        />
        <Button
          size="icon"
          aria-label="Send"
          disabled={!text.trim() || sending}
          onClick={() => void send()}
        >
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}

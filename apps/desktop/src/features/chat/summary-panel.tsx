import type { ChatSummary } from "@aura/shared";
import { Trash2, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { api, call } from "@/lib/api";
import { reportError } from "./actions";

export const loadSummary = (chatId: string) =>
  call(() => api.chats({ chatId }).summary.get()).then((r) => r.summary);

/**
 * What agents keep of this chat's older messages (ADR 0017). The user can read it and make the
 * agents forget it; a new one is written as the chat grows.
 */
export function SummaryPanel({
  summary,
  onCleared,
  onClose,
}: {
  summary: ChatSummary;
  onCleared: () => void;
  onClose: () => void;
}) {
  const clear = async () => {
    try {
      await call(() => api.chats({ chatId: summary.chatId }).summary.delete());
      onCleared();
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <aside className="bg-background flex w-80 shrink-0 flex-col border-l max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="font-semibold">Earlier in this chat</h2>
        <Button variant="ghost" size="icon" aria-label="Close summary" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-muted-foreground mb-3 text-xs">
          Agents see the latest messages as they are. The {summary.covered} older ones reach them as
          this summary, updated {new Date(summary.updatedAt).toLocaleString()}.
        </p>
        <div className="text-[13px]">
          <Markdown>{summary.text}</Markdown>
        </div>
      </div>
      <div className="border-t p-3">
        <Button variant="ghost" size="sm" className="rounded-full" onClick={() => void clear()}>
          <Trash2 /> Forget this summary
        </Button>
      </div>
    </aside>
  );
}

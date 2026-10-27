import type { RunCard as RunCardData } from "@aura/shared";
import { ChevronRight, GitCommitHorizontal, Wrench } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Agent activity attached to a reply: tool calls (collapsed by default) and the workspace commit. */
export function RunCard({ card }: { card: RunCardData }) {
  const [open, setOpen] = useState(false);
  const failed = card.tools.filter((t) => t.isError).length;

  return (
    <div className="mt-2 rounded-xl border bg-black/[0.03] text-xs dark:bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-2 py-1.5"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        <Wrench className="size-3.5" />
        <span>
          {card.tools.length} tool {card.tools.length === 1 ? "call" : "calls"}
          {failed > 0 && <span className="text-destructive"> · {failed} failed</span>}
          {card.status === "running" && " · working…"}
        </span>
        {card.commit && (
          <span className="ml-auto inline-flex items-center gap-1 font-mono">
            <GitCommitHorizontal className="size-3.5" />
            {card.commit}
          </span>
        )}
      </button>
      {open && (
        <ul className="space-y-0.5 border-t px-2 py-1.5 font-mono">
          {card.tools.map((tool, index) => (
            <li
              // Tool calls have no stable id on the card; order is stable for a given run.
              // biome-ignore lint/suspicious/noArrayIndexKey: list is append-only
              key={index}
              className={cn("flex gap-2", tool.isError && "text-destructive")}
            >
              <span className="shrink-0 font-semibold">{tool.name}</span>
              <span className="text-muted-foreground truncate">{tool.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

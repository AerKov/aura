import type { AlertCard as AlertCardData } from "@aura/shared";
import { ChevronRight, Siren } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const SEVERITY = {
  critical: "border-l-rose-500 bg-rose-50 dark:bg-rose-950/30",
  warning: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30",
  info: "border-l-sky-500 bg-sky-50 dark:bg-sky-950/30",
} as const;

/** An alert from a monitoring source. Its payload is external data and is shown as plain text. */
export function AlertCard({ card }: { card: AlertCardData }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "w-[min(34rem,100%)] rounded-xl border border-l-4 p-3 text-sm",
        SEVERITY[card.severity],
      )}
    >
      <div className="flex items-center gap-2">
        <Siren className="size-4 shrink-0" />
        <span className="font-semibold">{card.title}</span>
        {card.count > 1 && (
          <span className="rounded-full bg-black/10 px-1.5 text-xs dark:bg-white/10">
            ×{card.count}
          </span>
        )}
        <span className="text-muted-foreground ml-auto text-xs uppercase">{card.severity}</span>
      </div>
      {card.summary && <p className="mt-1 break-words">{card.summary}</p>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1 text-xs"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {card.source} · raw payload
      </button>
      {open && (
        <pre className="bg-background/70 mt-1 max-h-60 overflow-auto rounded border p-2 text-xs whitespace-pre-wrap">
          {card.raw}
        </pre>
      )}
    </div>
  );
}

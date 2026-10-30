import type { AlertCard as AlertCardData } from "@aura/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/features/localization/i18n";
import { cn } from "@/lib/utils";

const SEVERITY = {
  info: { bar: "bg-signal", label: "For your information" },
  warning: { bar: "bg-warning", label: "Worth a look" },
  critical: { bar: "bg-destructive", label: "Urgent" },
} as const;

/**
 * An alert from monitoring or an app (ADR 0034): a severity bar, how urgent in plain words, the
 * source and how often it repeated. Its raw payload is external data, shown as text on
 * mode only.
 */
export function AlertCard({ card }: { card: AlertCardData }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const severity = SEVERITY[card.severity];
  const at = new Date(card.lastAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="bg-card mt-1 flex w-[min(600px,100%)] border">
      <span className={cn("w-1 shrink-0", severity.bar)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
          <span
            className={cn(
              "font-semibold",
              card.severity === "critical" && "text-destructive",
              card.severity === "warning" && "text-warning-text",
              card.severity === "info" && "text-signal-text",
            )}
          >
            {t(severity.label)}
          </span>
          <span>{card.source}</span>
          <span className="font-mono">
            {card.count > 1
              ? t("repeated {n} times · last at {time}", { n: card.count, time: at })
              : at}
          </span>
        </div>
        <span className="text-[15px] font-medium">{card.title}</span>
        {card.summary && <p className="text-sm break-words">{card.summary}</p>}
        {
          <Button
            variant="ghost"
            size="sm"
            className="h-7 self-start"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? t("Hide details") : t("Technical details")}
          </Button>
        }
        {open && (
          <pre className="bg-background max-h-60 overflow-auto border p-2 font-mono text-xs whitespace-pre-wrap">
            {card.raw}
          </pre>
        )}
      </div>
    </div>
  );
}

import type { RunCard as RunCardData } from "@aura/shared";
import { formatTokens } from "@aura/shared";
import { Check, Loader, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/features/localization/i18n";
import { cn } from "@/lib/utils";

/** What a tool does, as a verb the user understands (ADR 0034). */
const VERBS: Record<string, string> = {
  Read: "Reads",
  Grep: "Searches",
  Glob: "Searches",
  Edit: "Changes",
  Write: "Creates",
  Bash: "Checks",
  WebSearch: "Searches the web",
  WebFetch: "Opens a page",
};
const LOOKS = new Set(["Read", "Grep", "Glob"]);
const CHANGES = new Set(["Edit", "Write"]);

const STATUS = {
  running: "{name} is working…",
  done: "{name} finished",
  error: "{name} could not finish",
  stopped: "{name} was stopped",
} as const;

/**
 * An agent's work on its reply (ADR 0034): who works and how it went, a plain summary ("looked at
 * 2, changed 3 files · checked, all works"), and the tool calls behind "Details", collapsed.
 */
export function RunCard({
  card,
  name,
  usage,
  onStop,
}: {
  card: RunCardData;
  name: string;
  usage: { tokens: number; costUsd: number | null } | null;
  onStop?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const running = card.status === "running";
  const looked = card.tools.filter((x) => LOOKS.has(x.name)).length;
  const changed = card.tools.filter((x) => CHANGES.has(x.name)).length;
  const tested = card.tools.some((x) => x.name === "Bash");
  const failedChecks = card.tools.some((x) => x.name === "Bash" && x.isError);
  const verb = (tool: string) => t(VERBS[tool] ?? "Uses {tool}", { tool });

  const parts: string[] = [];
  if (running) {
    const last = card.tools.at(-1);
    if (last) parts.push(t("Now: {what}…", { what: verb(last.name).toLowerCase() }));
  } else {
    if (looked) parts.push(t("looked at {n}", { n: looked }));
    if (changed) parts.push(t("changed files: {n}", { n: changed }));
    if (tested && card.status === "done")
      parts.push(failedChecks ? t("some checks failed") : t("checked, all works"));
  }

  return (
    <div className="bg-card mt-2 w-[min(600px,100%)] border px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            running && "bg-signal ring-signal/30 ring-[3px]",
            card.status === "done" && "bg-foreground",
            card.status === "error" && "bg-destructive",
            card.status === "stopped" && "border-muted-foreground border",
          )}
        />
        <span className="min-w-0 flex-1 text-[13.5px] font-medium">
          {t(STATUS[card.status], { name })}
        </span>
        {running && onStop && (
          <Button size="sm" variant="outline" className="h-7" onClick={onStop}>
            {t("Stop")}
          </Button>
        )}
        {card.tools.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? t("Hide") : t("Details")}
          </Button>
        )}
      </div>
      {parts.length > 0 && (
        <p className="text-muted-foreground mt-0.5 pl-5 text-[13px]">{parts.join(", ")}</p>
      )}
      {card.error && <p className="text-destructive mt-1.5 text-[13px]">{card.error}</p>}
      {open && (
        <ul className="mt-2 flex flex-col gap-1 border-t pt-2 text-[13px]">
          {card.tools.map((tool, index) => (
            <li
              // Tool calls have no stable id on the card; order is stable for a given run.
              // biome-ignore lint/suspicious/noArrayIndexKey: list is append-only
              key={index}
              className="flex min-w-0 items-center gap-2"
            >
              <span className="shrink-0">{verb(tool.name)}</span>
              <span className="text-muted-foreground min-w-0 truncate font-mono text-[11.5px]">
                {tool.summary}
              </span>
              <span className="ml-auto shrink-0">
                {tool.isError ? (
                  <X className="text-destructive size-3.5" />
                ) : running && index === card.tools.length - 1 ? (
                  <Loader className="text-signal size-3.5 animate-spin" />
                ) : (
                  <Check className="text-muted-foreground size-3.5" />
                )}
              </span>
            </li>
          ))}
          {usage && (
            <li className="text-muted-foreground mt-1 font-mono text-[11px]">
              {usage.costUsd !== null &&
                t("Spent ≈ {usd}", { usd: `$${usage.costUsd.toFixed(2)}` })}
              {` · ${formatTokens(usage.tokens)} ${t("tokens")}`}
              {card.commit && ` · ${card.commit}`}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

import type { ApprovalCard as ApprovalCardData } from "@aura/shared";
import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { tryCss } from "@/features/customize/appearance";
import { useT } from "@/features/localization/i18n";
import { cn } from "@/lib/utils";
import { decideApproval, reportError } from "./actions";

/**
 * A side effect an agent wants to perform (ADR 0034): who asks, what and why, what will change in
 * plain words, a warning when it asks for more, and "Yes, do it" / "No, thanks". The diff or plan
 * is behind "Technical details". Nothing happens until the user decides.
 */
export function ApprovalCard({ card, name }: { card: ApprovalCardData; name: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trying, setTrying] = useState(false);
  // Without plain changes the details are all there is to read, so they start open.
  const [details, setDetails] = useState(card.changes.length === 0);
  const pending = card.status === "pending";

  // Stop the try-on when the card is decided or leaves the screen.
  useEffect(() => {
    if (!pending && trying) {
      tryCss(null);
      setTrying(false);
    }
  }, [pending, trying]);
  useEffect(() => () => tryCss(null), []);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await decideApproval(card.approvalId, approve);
    } catch (err) {
      reportError(err);
      setError(err instanceof Error ? err.message : t("Could not save the decision"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "bg-card mt-2 flex w-[min(620px,100%)] flex-col gap-2.5 border p-3.5",
        pending ? "border-warning/65" : "opacity-85",
      )}
    >
      <span className="text-warning-text text-xs font-semibold">
        {t("Your decision is needed · {name}", { name })}
      </span>
      <h3 className="text-[21px]">{card.title}</h3>
      {card.why && (
        <div className="text-muted-foreground text-sm">
          <Markdown>{card.why}</Markdown>
        </div>
      )}
      {card.warning && (
        <p className="bg-warning/12 text-warning-text flex items-start gap-1.5 px-3 py-2 text-[13.5px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t(card.warning)}
        </p>
      )}
      {card.changes.length > 0 && (
        <div className="border-t pt-2.5">
          <span className="text-muted-foreground text-[12.5px]">{t("What will change")}</span>
          <ul className="mt-1 flex flex-col gap-0.5 text-[14.5px]">
            {card.changes.map((change) => (
              <li key={change} className="flex gap-2">
                <span className="text-signal-text">+</span>
                {change}
              </li>
            ))}
          </ul>
        </div>
      )}
      {details && (
        <div className="bg-background max-h-80 overflow-y-auto border px-3 py-2 text-sm">
          <Markdown>{card.preview}</Markdown>
        </div>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => void decide(true)}>
            {t("Yes, do it")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
            {t("No, thanks")}
          </Button>
          {card.tryCss && (
            <Button
              variant="ghost"
              onClick={() => {
                tryCss(trying ? null : (card.tryCss ?? null));
                setTrying(!trying);
              }}
            >
              {trying ? <EyeOff /> : <Eye />} {trying ? t("Stop trying") : t("Try it")}
            </Button>
          )}
          <Button
            variant="ghost"
            className="ml-auto"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            {details ? t("Hide details") : t("Technical details")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={cn(
              card.status === "approved" && "text-foreground",
              card.status !== "approved" && "text-muted-foreground",
              card.status === "failed" && "text-destructive",
            )}
          >
            {card.status === "approved"
              ? t("✓ You approved · done")
              : card.status === "rejected"
                ? t("✕ You declined · nothing changed")
                : t("✕ It did not work")}
          </span>
          {card.result && card.status !== "rejected" && (
            <span className="text-muted-foreground">{card.result}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            {details ? t("Hide details") : t("Technical details")}
          </Button>
        </div>
      )}
    </div>
  );
}

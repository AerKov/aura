import type { ApprovalCard as ApprovalCardData } from "@aura/shared";
import { Check, Eye, EyeOff, ShieldQuestion, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { tryCss } from "@/features/customize/appearance";
import { cn } from "@/lib/utils";
import { decideApproval, reportError } from "./actions";

const STATUS_LABEL = {
  pending: "Waiting for you",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
} as const;

/** A side effect an agent wants to perform; nothing happens until the user decides. */
export function ApprovalCard({ card }: { card: ApprovalCardData }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trying, setTrying] = useState(false);

  // Stop the try-on when the card is decided or leaves the screen.
  useEffect(() => {
    if (card.status !== "pending" && trying) {
      tryCss(null);
      setTrying(false);
    }
  }, [card.status, trying]);
  useEffect(() => () => tryCss(null), []);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await decideApproval(card.approvalId, approve);
    } catch (err) {
      reportError(err);
      setError(err instanceof Error ? err.message : "Could not save the decision");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border-primary/40 mt-2 w-[min(36rem,100%)] overflow-hidden rounded-lg border">
      <div className="bg-primary/8 kicker text-primary! border-primary/30 border-b px-4 py-1.5">
        Approval · @{card.requestedBy}
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldQuestion className="size-4 text-amber-600" />
          <span className="font-semibold">{card.title}</span>
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium",
              card.status === "pending" &&
                "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
              card.status === "approved" &&
                "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
              (card.status === "rejected" || card.status === "failed") &&
                "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
            )}
          >
            {STATUS_LABEL[card.status]}
          </span>
        </div>
        {card.why && (
          <div className="text-muted-foreground mb-2 text-sm">
            <Markdown>{card.why}</Markdown>
          </div>
        )}
        <div className="bg-background/60 max-h-80 overflow-y-auto rounded-lg border px-3 py-2 text-sm">
          <Markdown>{card.preview}</Markdown>
        </div>
        {card.result && (
          <p className={cn("mt-2 text-sm", card.status === "failed" && "text-destructive")}>
            {card.result}
          </p>
        )}
        {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
        {card.status === "pending" && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide(true)}>
              <Check /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(false)}>
              <X /> Reject
            </Button>
            {card.tryCss && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  tryCss(trying ? null : (card.tryCss ?? null));
                  setTrying(!trying);
                }}
              >
                {trying ? <EyeOff /> : <Eye />} {trying ? "Stop trying" : "Try it"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

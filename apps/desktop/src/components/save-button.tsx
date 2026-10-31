import { Check, Loader, TriangleAlert } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { useT } from "@/features/localization/i18n";

type State = "idle" | "saving" | "saved" | "failed";

/**
 * A button that saves something and says how it went: a spinner while it saves, then "Saved" or
 * "Not saved" for a moment. The error itself goes to the usual error report.
 */
export function SaveButton({
  onSave,
  children,
  savedLabel,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "children"> & {
  onSave: () => Promise<unknown>;
  /** The label at rest; "Save" by default. */
  children?: ReactNode;
  savedLabel?: string;
}) {
  const t = useT();
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = async () => {
    if (state === "saving") return;
    setState("saving");
    let next: State = "saved";
    try {
      await onSave();
    } catch (error) {
      reportError(error);
      next = "failed";
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), next === "saved" ? 1500 : 3000);
  };

  return (
    <Button
      {...props}
      disabled={disabled || state === "saving"}
      aria-busy={state === "saving"}
      onClick={() => void run()}
    >
      {state === "saving" ? (
        <>
          <Loader className="animate-spin" /> {t("Saving…")}
        </>
      ) : state === "saved" ? (
        <>
          <Check /> {savedLabel ?? t("Saved")}
        </>
      ) : state === "failed" ? (
        <>
          <TriangleAlert /> {t("Not saved")}
        </>
      ) : (
        (children ?? (
          <>
            <Check /> {t("Save")}
          </>
        ))
      )}
    </Button>
  );
}

import { cn } from "@/lib/utils";

/** An on/off switch (ADR 0034): a hairline track with a square thumb, corners from the theme. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Its accessible name, e.g. "Turn off Chats". */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative block h-[18px] w-[30px] shrink-0 rounded-sm border transition-colors duration-150 ease-[var(--ease)] disabled:opacity-45",
        checked ? "border-primary bg-primary" : "border-input bg-muted",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] size-2.5 rounded-xs transition-all duration-150 ease-[var(--ease)]",
          checked ? "bg-primary-foreground left-[15px]" : "bg-muted-foreground left-[3px]",
        )}
      />
    </button>
  );
}

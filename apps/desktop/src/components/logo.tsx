import { cn } from "@/lib/utils";

/**
 * Aura's glyph: a lowercase "a" whose bowl is a ring around a glowing core (ADR 0010). The ring and
 * stem use `currentColor`; the core uses `coreClassName` (the signal colour by default).
 */
export function AuraGlyph({
  className,
  coreClassName = "fill-primary",
}: {
  className?: string;
  coreClassName?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-full", className)}>
      <circle cx="45" cy="50" r="23.5" fill="none" stroke="currentColor" strokeWidth="8" />
      <circle cx="45" cy="50" r="8.5" className={coreClassName} />
      <rect x="64.5" y="22.5" width="8" height="55" rx="4" fill="currentColor" />
    </svg>
  );
}

/** The app icon in the UI: the glyph on an ink tile. */
export function AuraLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-foreground text-background inline-flex shrink-0 items-center justify-center rounded-[30%] p-[12%]",
        className,
      )}
    >
      <AuraGlyph />
    </span>
  );
}

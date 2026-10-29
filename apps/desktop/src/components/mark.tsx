import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Agents are squares told apart by fill style, not hue, so they work with any theme (ADR 0034).
 * The orchestrator is solid primary and @builder solid ink; the others keep one style by name.
 */
const STYLES = [
  "bg-accent text-accent-foreground border border-accent-foreground/20",
  "border border-primary text-primary",
  "border border-dashed border-foreground/60 text-foreground",
  "bg-secondary text-secondary-foreground border",
] as const;

export function markStyle(name: string): string {
  if (name === "builder") return "bg-foreground text-background";
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return STYLES[hash % STYLES.length] ?? STYLES[0];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s_-]+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-[26px] text-[10px]",
  md: "size-[34px] text-[12px]",
  lg: "size-10 text-sm",
  xl: "size-[52px] text-lg",
};

/**
 * A participant's mark: agents are square monograms (the orchestrator solid primary), people are
 * round. `working` shows a small pulsing signal dot in the corner.
 */
export function Mark({
  name,
  kind = "agent",
  size = "md",
  working = false,
  icon: Icon,
  className,
}: {
  name: string;
  kind?: "agent" | "orchestrator" | "user" | "bot" | "alert";
  size?: keyof typeof SIZES;
  working?: boolean;
  icon?: LucideIcon;
  className?: string;
}) {
  const look =
    kind === "orchestrator"
      ? "bg-primary text-primary-foreground"
      : kind === "user"
        ? "bg-secondary text-secondary-foreground border rounded-pill"
        : kind === "alert"
          ? "border border-warning text-warning-text"
          : markStyle(name);
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center font-heading font-semibold",
        SIZES[size],
        look,
        className,
      )}
    >
      {Icon ? <Icon className="size-[50%]" /> : kind === "alert" ? "!" : initialsOf(name)}
      {working && (
        <span className="bg-primary ring-background absolute -right-1 -bottom-1 size-2.5 animate-pulse rounded-full ring-2" />
      )}
    </span>
  );
}

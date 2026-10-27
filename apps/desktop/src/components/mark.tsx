import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Stable hue (0-359) for a name, so every agent keeps its colour everywhere. */
export function hueOf(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s_-]+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-[11px]",
  lg: "size-10 text-xs",
  xl: "size-16 text-base",
};

/**
 * A participant's mark: a rounded monogram tile tinted by its name. The orchestrator is a solid signal
 * tile; `working` shows a small pulsing signal square in the corner.
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
      ? "bg-primary text-primary-foreground border border-primary"
      : kind === "user"
        ? "bg-secondary text-secondary-foreground border"
        : kind === "alert"
          ? "bg-destructive/10 text-destructive border border-destructive/30"
          : "mark";
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-[34%] font-mono font-semibold",
        SIZES[size],
        look,
        className,
      )}
      style={{ "--h": hueOf(name) } as CSSProperties}
    >
      {Icon ? (
        <Icon className="size-[50%]" />
      ) : kind === "orchestrator" ? (
        <span className="text-[1.15em] leading-none">◆</span>
      ) : (
        initialsOf(name)
      )}
      {working && (
        <span className="bg-primary ring-background absolute -right-1 -bottom-1 size-2.5 animate-pulse rounded-full ring-2" />
      )}
    </span>
  );
}

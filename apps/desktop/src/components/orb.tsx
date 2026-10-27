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
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
  xl: "size-20 text-xl",
};

/**
 * The visual presence of a participant: a glowing sphere tinted by its name. The orchestrator wears
 * the aura gradient; `active` makes the orb breathe while the agent works.
 */
export function Orb({
  name,
  kind = "agent",
  size = "md",
  active = false,
  icon: Icon,
  className,
}: {
  name: string;
  kind?: "agent" | "orchestrator" | "user" | "bot" | "alert";
  size?: keyof typeof SIZES;
  active?: boolean;
  icon?: LucideIcon;
  className?: string;
}) {
  const h = hueOf(name);
  const background =
    kind === "orchestrator"
      ? "radial-gradient(circle at 30% 28%, oklch(0.95 0.05 80) 0%, transparent 38%), conic-gradient(from 210deg, var(--aura-1), var(--aura-2), var(--aura-1))"
      : kind === "user"
        ? "radial-gradient(circle at 30% 28%, oklch(0.98 0 0 / .7), transparent 40%), linear-gradient(145deg, oklch(0.72 0.02 285), oklch(0.5 0.03 285))"
        : kind === "alert"
          ? "radial-gradient(circle at 30% 28%, oklch(0.97 0.05 60 / .8), transparent 40%), linear-gradient(145deg, oklch(0.78 0.16 50), oklch(0.58 0.21 25))"
          : `radial-gradient(circle at 30% 28%, oklch(0.97 0.04 ${h} / .85), transparent 40%), linear-gradient(145deg, oklch(0.76 0.13 ${h}), oklch(0.5 0.17 ${(h + 25) % 360}))`;
  const glow = kind === "orchestrator" ? "var(--aura-1)" : `oklch(0.7 0.17 ${h})`;
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-[inset_0_-2px_6px_rgb(0_0_0/0.18)]",
        SIZES[size],
        active && "orb-active",
        className,
      )}
      style={{ background, "--orb-glow": glow } as CSSProperties}
    >
      {Icon ? (
        <Icon className="size-[45%]" />
      ) : kind === "orchestrator" ? null : (
        <span className="drop-shadow-sm">{initialsOf(name)}</span>
      )}
    </span>
  );
}

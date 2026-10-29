/**
 * The shell as a tiling window manager (ADR 0028): how tiles look, where the bar sits, which key is
 * Mod, and pure helpers for keyboard navigation. Shared by the server (settings, the orchestrator's
 * tool) and the client.
 */
import type { Layout, LayoutNode, Tile } from "./layout";

export type BarEdge = "left" | "right" | "top" | "bottom";
export const BAR_EDGES: readonly BarEdge[] = ["left", "right", "top", "bottom"];

/**
 * Which bar shows (ADR 0029): Aura's built-in one, the user's bar app (code they change in its
 * chat, with approval and versions; the built-in one stands in when it fails), or none.
 */
export type BarMode = "builtin" | "app" | "off";
export const BAR_MODES: readonly BarMode[] = ["builtin", "app", "off"];

/** The bar's thickness in px, when the user sets it; Aura's own bar needs at least 44. */
export const BAR_SIZE = { min: 24, max: 96, builtinMin: 44 } as const;

/** The id of the app that can be the bar. */
export const BAR_APP_ID = "bar";

/** A tile's title bar: full, a thin strip whose buttons show on hover, or none (hover overlay). */
export type TitleStyle = "full" | "minimal" | "none";
export const TITLE_STYLES: readonly TitleStyle[] = ["full", "minimal", "none"];

/**
 * The modifier of the shortcuts. Option+digits type symbols on macOS, so there Ctrl+Option fits;
 * "meta" is Super/Cmd, which a desktop tiling window manager may already use.
 */
export type ModKey = "alt" | "ctrl-alt" | "meta";
export const MOD_KEYS: readonly ModKey[] = ["alt", "ctrl-alt", "meta"];

export interface WindowStyle {
  /** Space between tiles and around them, px. */
  gaps: number;
  /** Corner radius of tiles, px. */
  radius: number;
  /** Border width of tiles, px; the focused one gets the accent colour. */
  border: number;
  titles: TitleStyle;
  mod: ModKey;
}

export const WM_PRESETS = {
  hyprland: { gaps: 10, radius: 10, border: 2, titles: "minimal" },
  i3: { gaps: 0, radius: 0, border: 1, titles: "full" },
} as const satisfies Record<string, Omit<WindowStyle, "mod">>;
export type WmPreset = keyof typeof WM_PRESETS;

export function defaultWindowStyle(): WindowStyle {
  return { ...WM_PRESETS.hyprland, mod: "alt" };
}

const LIMITS = { gaps: 24, radius: 24, border: 4 } as const;

function clampInt(value: unknown, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/** A window style from storage or input: unknown values fall back, numbers are clamped. */
export function normalizeWindowStyle(raw: unknown, base = defaultWindowStyle()): WindowStyle {
  const v = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    gaps: clampInt(v.gaps, LIMITS.gaps, base.gaps),
    radius: clampInt(v.radius, LIMITS.radius, base.radius),
    border: clampInt(v.border, LIMITS.border, base.border),
    titles: TITLE_STYLES.includes(v.titles as TitleStyle) ? (v.titles as TitleStyle) : base.titles,
    mod: MOD_KEYS.includes(v.mod as ModKey) ? (v.mod as ModKey) : base.mod,
  };
}

export type Direction = "left" | "right" | "up" | "down";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The tile next to `from` in a direction, by their rectangles on screen: the nearest one beyond
 * the edge that overlaps it across, like i3's focus.
 */
export function neighbour(
  rects: Record<string, Rect>,
  from: string,
  dir: Direction,
): string | null {
  const a = rects[from];
  if (!a) return null;
  let best: { id: string; distance: number; overlap: number } | null = null;
  for (const [id, b] of Object.entries(rects)) {
    if (id === from) continue;
    const horizontal = dir === "left" || dir === "right";
    const distance =
      dir === "left"
        ? a.left - b.right
        : dir === "right"
          ? b.left - a.right
          : dir === "up"
            ? a.top - b.bottom
            : b.top - a.bottom;
    // Beyond the edge (gaps allowed), and overlapping across.
    if (distance < -1) continue;
    const overlap = horizontal
      ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      : Math.min(a.right, b.right) - Math.max(a.left, b.left);
    if (overlap <= 0) continue;
    if (!best || distance < best.distance || (distance === best.distance && overlap > best.overlap))
      best = { id, distance, overlap };
  }
  return best?.id ?? null;
}

/** Swaps the apps of two tiles (Mod+Shift+arrow); the focus follows the moved app. */
export function swapTiles(layout: Layout, a: string, b: string): Layout {
  const all: Tile[] = [];
  const walk = (n: LayoutNode) => (n.kind === "tile" ? all.push(n) : n.children.forEach(walk));
  walk(layout.root);
  const ta = all.find((t) => t.id === a);
  const tb = all.find((t) => t.id === b);
  if (!ta || !tb || a === b) return layout;
  const swap = (n: LayoutNode): LayoutNode =>
    n.kind === "tile"
      ? n.id === a
        ? { ...n, app: tb.app }
        : n.id === b
          ? { ...n, app: ta.app }
          : n
      : { ...n, children: n.children.map(swap) };
  return { root: swap(layout.root), focused: b };
}

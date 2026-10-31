/**
 * The shell's layout (ADR 0024, ADR 0027): a tree of splits whose leaves are tiles, one app each.
 * Pure functions, shared by the server (storage, the orchestrator's tool) and the client.
 */

/** An app the shell can open: the Home launcher, the messenger, a built-in page, or an extension. */
export type AppRef = "home" | "messenger" | `page:${PageId}` | `ext:${string}`;

export const PAGE_IDS = [
  "settings",
  "skills",
  "memory",
  "agents",
  "catalog",
  "jobs",
  "engines",
  "customize",
  "devices",
  "localization",
  "backups",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/**
 * The tabs of the Settings app (ADR 0039). The pages that were apps of their own before it open
 * Settings at their tab, so saved screens and the orchestrator's old names keep working.
 */
export const SETTINGS_TABS = ["ai", "helpers", "automations", "history"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function settingsTabOf(page: PageId): SettingsTab {
  switch (page) {
    case "agents":
    case "skills":
    case "memory":
      return "helpers";
    case "jobs":
      return "automations";
    case "catalog":
    case "backups":
      return "history";
    default:
      return "ai";
  }
}

export interface Tile {
  kind: "tile";
  id: string;
  /** The app shown in this tile. An app is open in at most one tile, except Home. */
  app: AppRef;
}

export interface Split {
  kind: "split";
  id: string;
  /** "row": side by side; "column": one above the other. */
  dir: "row" | "column";
  /** At least two. */
  children: LayoutNode[];
  /** Percentages, one per child, adding up to 100. */
  sizes: number[];
}

export type LayoutNode = Tile | Split;

export interface Layout {
  root: LayoutNode;
  /** The tile apps open in. */
  focused: string;
}

export type Placement = "here" | "right" | "below";

const MAX_TILES = 12;
const EXT_ID = /^[a-z][a-z0-9-]{1,47}$/;

export function isAppRef(value: unknown): value is AppRef {
  if (typeof value !== "string") return false;
  if (value === "home" || value === "messenger") return true;
  if (value.startsWith("page:")) return (PAGE_IDS as readonly string[]).includes(value.slice(5));
  return value.startsWith("ext:") && EXT_ID.test(value.slice(4));
}

/** First launch and an empty screen: the home shelf. */
export function defaultLayout(): Layout {
  return { root: { kind: "tile", id: "t1", app: "home" }, focused: "t1" };
}

export function tiles(node: LayoutNode): Tile[] {
  return node.kind === "tile" ? [node] : node.children.flatMap(tiles);
}

/** The tile showing `app`, if it is open anywhere (the first one, for Home). */
export function tileOf(layout: Layout, app: AppRef): Tile | undefined {
  return tiles(layout.root).find((t) => t.app === app);
}

export function focusedTile(layout: Layout): Tile {
  const all = tiles(layout.root);
  return all.find((t) => t.id === layout.focused) ?? (all[0] as Tile);
}

/** Apps visible right now, one per tile. */
export function visibleApps(layout: Layout): AppRef[] {
  return tiles(layout.root).map((t) => t.app);
}

function nextId(layout: Layout, prefix: "t" | "s"): string {
  const used = new Set<string>();
  const walk = (n: LayoutNode) => {
    used.add(n.id);
    if (n.kind === "split") n.children.forEach(walk);
  };
  walk(layout.root);
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

function mapNode(node: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  const mapped = fn(node);
  // A replaced node is final: it may contain the old node (a tile wrapped in a new split).
  if (mapped !== node || mapped.kind === "tile") return mapped;
  return { ...mapped, children: mapped.children.map((c) => mapNode(c, fn)) };
}

/** Marks a tile for removal by `normalize`. */
const GONE = null as unknown as AppRef;

/** Removes closed tiles and splits with one child, and rescales sizes to 100. */
export function normalize(layout: Layout): Layout {
  const clean = (node: LayoutNode): LayoutNode | null => {
    if (node.kind === "tile") return node.app === GONE ? null : node;
    const kept: { child: LayoutNode; size: number }[] = [];
    node.children.forEach((c, i) => {
      const child = clean(c);
      if (child) kept.push({ child, size: node.sizes[i] ?? 0 });
    });
    if (kept.length === 0) return null;
    if (kept.length === 1) return (kept[0] as { child: LayoutNode }).child;
    // A child split in the same direction is merged into its parent.
    const flat: { child: LayoutNode; size: number }[] = [];
    for (const k of kept) {
      if (k.child.kind === "split" && k.child.dir === node.dir) {
        const inner = k.child;
        const total = inner.sizes.reduce((a, b) => a + b, 0) || 1;
        inner.children.forEach((c, i) => {
          flat.push({ child: c, size: (k.size * (inner.sizes[i] ?? 0)) / total });
        });
      } else flat.push(k);
    }
    const total = flat.reduce((a, b) => a + b.size, 0);
    const sizes = flat.map((f) => (total > 0 ? (f.size * 100) / total : 100 / flat.length));
    return { ...node, children: flat.map((f) => f.child), sizes };
  };
  const root = clean(layout.root);
  if (!root) return defaultLayout();
  const all = tiles(root);
  const focused = all.some((t) => t.id === layout.focused) ? layout.focused : (all[0] as Tile).id;
  return { root, focused };
}

export function focus(layout: Layout, tileId: string): Layout {
  return tiles(layout.root).some((t) => t.id === tileId) ? { ...layout, focused: tileId } : layout;
}

/**
 * Opens an app. If it is open already, its tile is focused ("here") or it moves to a new tile
 * ("right", "below"). Otherwise it replaces the app of the focused tile ("here") or opens in a new
 * tile next to it. There are no tabs: a tile shows one app (ADR 0027).
 */
export function openApp(layout: Layout, app: AppRef, where: Placement = "here"): Layout {
  // Home is a launcher, like a new terminal: a new tile always gets a fresh one (ADR 0028).
  const existing = app === "home" && where !== "here" ? undefined : tileOf(layout, app);
  if (existing && where === "here") return { ...layout, focused: existing.id };
  // Moving an open app to a new tile: take it out of its old one first.
  const base = existing && existing.id !== layout.focused ? closeApp(layout, app) : layout;
  const target = focusedTile(base);
  if (where === "here" || tiles(base.root).length >= MAX_TILES) {
    if (target.app === app) return { ...base, focused: target.id };
    return {
      root: mapNode(base.root, (n) => (n.id === target.id ? { ...target, app } : n)),
      focused: target.id,
    };
  }
  if (target.app === app && app !== "home") return base;
  const tile: Tile = { kind: "tile", id: nextId(base, "t"), app };
  const split: Split = {
    kind: "split",
    id: nextId(base, "s"),
    dir: where === "right" ? "row" : "column",
    children: [target, tile],
    sizes: [50, 50],
  };
  return normalize({
    root: mapNode(base.root, (n) => (n.id === target.id ? split : n)),
    focused: tile.id,
  });
}

/** Closes an app's tile; an empty screen gets the home shelf. */
export function closeApp(layout: Layout, app: AppRef): Layout {
  return normalize({
    ...layout,
    root: mapNode(layout.root, (n) =>
      n.kind === "tile" && n.app === app ? { ...n, app: GONE } : n,
    ),
  });
}

export function closeTile(layout: Layout, tileId: string): Layout {
  return normalize({
    ...layout,
    root: mapNode(layout.root, (n) =>
      n.id === tileId && n.kind === "tile" ? { ...n, app: GONE } : n,
    ),
  });
}

/** New sizes of a split after the user dragged its separators. */
export function resize(layout: Layout, splitId: string, sizes: number[]): Layout {
  return {
    ...layout,
    root: mapNode(layout.root, (n) =>
      n.kind === "split" && n.id === splitId && sizes.length === n.children.length
        ? { ...n, sizes }
        : n,
    ),
  };
}

/** Keeps only apps that exist now (an extension may have been removed, an app turned off). */
export function prune(layout: Layout, exists: (app: AppRef) => boolean): Layout {
  return normalize({
    ...layout,
    root: mapNode(layout.root, (n) =>
      n.kind === "tile" && !exists(n.app) ? { ...n, app: GONE } : n,
    ),
  });
}

export class LayoutError extends Error {
  override name = "LayoutError";
}

/**
 * Validates a layout from storage or the network; tiles with unknown or repeated apps are dropped.
 * A layout saved with tabs (before ADR 0027) keeps each tile's active app.
 */
export function validateLayout(raw: unknown): Layout {
  const seen = new Set<string>();
  const ids = new Set<string>();
  let count = 0;
  const node = (value: unknown, depth: number): LayoutNode => {
    if (depth > 8) throw new LayoutError("layout is nested too deeply");
    if (typeof value !== "object" || value === null) throw new LayoutError("bad layout node");
    const v = value as Record<string, unknown>;
    if (typeof v.id !== "string" || !/^[ts]\d{1,4}$/.test(v.id) || ids.has(v.id))
      throw new LayoutError("bad or repeated node id");
    ids.add(v.id);
    if (v.kind === "tile") {
      if (++count > MAX_TILES) throw new LayoutError(`at most ${MAX_TILES} tiles`);
      const legacy = Array.isArray(v.tabs) ? v.tabs.filter(isAppRef) : [];
      const wanted = isAppRef(v.app)
        ? v.app
        : isAppRef(v.active) && legacy.includes(v.active)
          ? v.active
          : legacy[0];
      // Only Home may show in several tiles.
      const app = wanted && (wanted === "home" || !seen.has(wanted)) ? wanted : GONE;
      if (app) seen.add(app);
      return { kind: "tile", id: v.id, app };
    }
    if (v.kind === "split") {
      if (v.dir !== "row" && v.dir !== "column") throw new LayoutError("bad split direction");
      if (!Array.isArray(v.children) || v.children.length < 1)
        throw new LayoutError("a split needs children");
      const children = v.children.map((c) => node(c, depth + 1));
      const sizes =
        Array.isArray(v.sizes) &&
        v.sizes.length === children.length &&
        v.sizes.every((s) => typeof s === "number" && s >= 0 && s <= 100)
          ? (v.sizes as number[])
          : children.map(() => 100 / children.length);
      return { kind: "split", id: v.id, dir: v.dir, children, sizes };
    }
    throw new LayoutError("bad layout node");
  };
  if (typeof raw !== "object" || raw === null) throw new LayoutError("layout must be an object");
  const r = raw as Record<string, unknown>;
  const root = node(r.root, 0);
  return normalize({ root, focused: typeof r.focused === "string" ? r.focused : "" });
}

/** A short description for the orchestrator: which apps are open and how; * marks the focused. */
export function describeLayout(layout: Layout): string {
  const show = (n: LayoutNode): string =>
    n.kind === "tile"
      ? `[${n.id === layout.focused ? "*" : ""}${n.app}]`
      : `${n.dir === "row" ? "side by side" : "stacked"}(${n.children.map(show).join(" | ")})`;
  return show(layout.root);
}

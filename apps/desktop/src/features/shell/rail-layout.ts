import { RAIL_PINNED, type RailLayout } from "@aura/shared";

/**
 * Applies the user's rail layout: items named in `order` come first in that order, the rest keep
 * their default order after them (new extensions land at the end); hidden ones are left out,
 * except Chats and Customize.
 */
export function arrangeRail<T extends { key: string }>(
  items: T[],
  layout: Pick<RailLayout, "order" | "hidden"> | undefined,
  { withHidden = false } = {},
): T[] {
  const order = layout?.order ?? [];
  const hidden = new Set((layout?.hidden ?? []).filter((k) => !RAIL_PINNED.includes(k)));
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => withHidden || !hidden.has(item.key))
    .sort((a, b) => rank(a.item.key) - rank(b.item.key) || a.index - b.index)
    .map(({ item }) => item);
}

/** Moves a key one step up or down in the arranged list and returns the new full order. */
export function moveRailItem(keys: string[], key: string, step: -1 | 1): string[] {
  const i = keys.indexOf(key);
  const j = i + step;
  if (i === -1 || j < 0 || j >= keys.length) return keys;
  const next = [...keys];
  [next[i], next[j]] = [next[j] as string, next[i] as string];
  return next;
}

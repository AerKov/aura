import type { Direction, ModKey } from "@aura/shared";

/** What a key press asks the window manager to do (ADR 0028). */
export type WmAction =
  | { type: "focus"; dir: Direction }
  | { type: "move"; dir: Direction }
  | { type: "split"; where: "right" | "below" }
  | { type: "close" }
  | { type: "home" }
  | { type: "app"; index: number };

export interface KeyLike {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const ARROWS: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

function modHeld(e: KeyLike, mod: ModKey): boolean {
  if (mod === "alt") return e.altKey && !e.ctrlKey && !e.metaKey;
  if (mod === "ctrl-alt") return e.ctrlKey && e.altKey && !e.metaKey;
  return e.metaKey && !e.ctrlKey && !e.altKey;
}

/**
 * The action of a key press, or null. Keys are read by their position (`code`), since Option
 * changes the typed character on macOS. In a text field, arrows keep their editing meaning.
 */
export function matchShortcut(e: KeyLike, mod: ModKey, editable: boolean): WmAction | null {
  if (!modHeld(e, mod)) return null;
  const dir = ARROWS[e.key];
  if (dir) {
    if (editable) return null;
    return e.shiftKey ? { type: "move", dir } : { type: "focus", dir };
  }
  if (e.key === "Enter") return { type: "split", where: e.shiftKey ? "below" : "right" };
  if (e.shiftKey) return null;
  if (e.code === "KeyQ") return { type: "close" };
  if (e.code === "KeyH") return { type: "home" };
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) return { type: "app", index: Number(digit[1]) - 1 };
  return null;
}

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

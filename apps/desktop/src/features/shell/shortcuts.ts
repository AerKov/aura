import { neighbour, type Rect, swapTiles } from "@aura/shared";
import { getState } from "@/features/chat/store";
import { closeTileId, focusTile, openAppRef, setLayout } from "./layout";
import type { WmAction } from "./shortcut-keys";

/** The tiles' rectangles on screen, by tile id. */
function tileRects(): Record<string, Rect> {
  const rects: Record<string, Rect> = {};
  for (const el of document.querySelectorAll<HTMLElement>("[data-tile-id]")) {
    const r = el.getBoundingClientRect();
    rects[el.dataset.tileId ?? ""] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return rects;
}

/** Carries out an action; `apps` are the bar's items in order, for Mod+1…9. */
export function runWmAction(action: WmAction, apps: string[], open: (key: string) => void): void {
  const layout = getState().layout;
  switch (action.type) {
    case "focus":
    case "move": {
      const next = neighbour(tileRects(), layout.focused, action.dir);
      if (!next) return;
      if (action.type === "focus") focusTile(next);
      else setLayout(swapTiles(layout, layout.focused, next));
      return;
    }
    case "split":
      openAppRef("home", action.where);
      return;
    case "close":
      closeTileId(layout.focused);
      return;
    case "home":
      openAppRef("home");
      return;
    case "app": {
      const key = apps[action.index];
      if (key) open(key);
    }
  }
}

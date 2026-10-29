import { describe, expect, test } from "bun:test";
import { defaultLayout, openApp, visibleApps } from "./layout";
import { neighbour, normalizeWindowStyle, type Rect, swapTiles, WM_PRESETS } from "./wm";

// Three tiles: a | b on top, c below across the width, with 8px gaps.
const rects: Record<string, Rect> = {
  a: { left: 8, top: 8, right: 496, bottom: 396 },
  b: { left: 504, top: 8, right: 992, bottom: 396 },
  c: { left: 8, top: 404, right: 992, bottom: 792 },
};

describe("window layout (ADR 0028)", () => {
  test("focus moves to the nearest tile in a direction, across gaps", () => {
    expect(neighbour(rects, "a", "right")).toBe("b");
    expect(neighbour(rects, "b", "left")).toBe("a");
    expect(neighbour(rects, "a", "down")).toBe("c");
    expect(neighbour(rects, "c", "up")).toBe("a");
    expect(neighbour(rects, "a", "left")).toBeNull();
    expect(neighbour(rects, "c", "down")).toBeNull();
    expect(neighbour(rects, "nope", "up")).toBeNull();
  });

  test("swapping tiles swaps their apps; the focus follows", () => {
    let l = openApp(defaultLayout(), "ext:crm", "right");
    l = swapTiles(l, "t1", "t2");
    expect(visibleApps(l)).toEqual(["ext:crm", "home"]);
    expect(l.focused).toBe("t2");
    expect(swapTiles(l, "t1", "t9")).toBe(l);
  });

  test("Mod+Enter on Home opens another Home: it is a launcher, not an app", () => {
    let l = openApp(defaultLayout(), "home", "right");
    expect(visibleApps(l)).toEqual(["home", "home"]);
    expect(l.focused).toBe("t2");
    l = openApp(l, "ext:crm");
    expect(visibleApps(l)).toEqual(["home", "ext:crm"]);
  });

  test("window styles are clamped and fall back on bad values", () => {
    expect(
      normalizeWindowStyle({ gaps: 99, radius: -3, border: 2.6, titles: "fancy", mod: "x" }),
    ).toEqual({ gaps: 24, radius: 0, border: 3, titles: "minimal", mod: "alt" });
    expect(normalizeWindowStyle({ ...WM_PRESETS.compact, mod: "ctrl-alt" })).toEqual({
      gaps: 0,
      radius: 0,
      border: 1,
      titles: "full",
      mod: "ctrl-alt",
    });
  });
});

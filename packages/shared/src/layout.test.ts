import { describe, expect, test } from "bun:test";
import {
  closeApp,
  defaultLayout,
  describeLayout,
  type Layout,
  openApp,
  prune,
  resize,
  tiles,
  validateLayout,
  visibleApps,
} from "./layout";

describe("shell layout (ADR 0024, ADR 0027)", () => {
  test("starts with the home shelf on the whole screen", () => {
    expect(visibleApps(defaultLayout())).toEqual(["home"]);
  });

  test("opening an app replaces the focused tile's app, or opens a tile to the right or below", () => {
    let l = openApp(defaultLayout(), "page:skills");
    expect(tiles(l.root)).toHaveLength(1);
    expect(visibleApps(l)).toEqual(["page:skills"]);
    l = openApp(l, "ext:crm", "right");
    expect(visibleApps(l)).toEqual(["page:skills", "ext:crm"]);
    expect(l.root).toMatchObject({ kind: "split", dir: "row", sizes: [50, 50] });
    l = openApp(l, "page:agents", "below");
    expect(describeLayout(l)).toBe(
      "side by side([page:skills] | stacked([ext:crm] | [*page:agents]))",
    );
    // No tabs pile up: opening another app here swaps it in.
    l = openApp(l, "messenger");
    expect(visibleApps(l)).toEqual(["page:skills", "ext:crm", "messenger"]);
  });

  test("an open app is focused instead of opened twice; moving it keeps one copy", () => {
    let l = openApp(defaultLayout(), "ext:crm", "right");
    l = openApp(l, "home");
    expect(l.focused).toBe("t1");
    l = openApp(l, "ext:crm", "below");
    expect(visibleApps(l).filter((a) => a === "ext:crm")).toHaveLength(1);
  });

  test("closing an app removes its tile; an empty screen gets the shelf", () => {
    let l = openApp(defaultLayout(), "ext:crm", "right");
    l = closeApp(l, "ext:crm");
    expect(l.root.kind).toBe("tile");
    expect(visibleApps(closeApp(l, "home"))).toEqual(["home"]);
  });

  test("sizes follow the user's drag; removed apps disappear", () => {
    let l = openApp(defaultLayout(), "ext:crm", "right");
    l = resize(l, l.root.id, [70, 30]);
    expect(l.root).toMatchObject({ sizes: [70, 30] });
    l = prune(l, (a) => a !== "ext:crm");
    expect(visibleApps(l)).toEqual(["home"]);
  });

  test("validation drops unknown and repeated apps, keeps old tabs' active app, refuses bad shapes", () => {
    const raw = {
      root: {
        kind: "split",
        id: "s1",
        dir: "row",
        sizes: [40, 30, 30],
        children: [
          { kind: "tile", id: "t1", tabs: ["messenger", "page:nope", "ext:Bad"], active: "x" },
          { kind: "tile", id: "t2", tabs: ["messenger", "page:agents"], active: "page:agents" },
          { kind: "tile", id: "t3", app: "messenger" },
        ],
      },
      focused: "t9",
    };
    const l: Layout = validateLayout(raw);
    expect(describeLayout(l)).toBe("side by side([*messenger] | [page:agents])");
    expect(l.focused).toBe("t1");
    expect(() => validateLayout({ root: { kind: "window" } })).toThrow();
    expect(() =>
      validateLayout({ root: { kind: "split", id: "s1", dir: "diagonal", children: [] } }),
    ).toThrow();
  });
});

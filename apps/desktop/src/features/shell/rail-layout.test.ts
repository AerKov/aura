import { describe, expect, test } from "bun:test";
import { arrangeRail, moveRailItem } from "./rail-layout";

const items = ["chats", "skills", "memory", "ext:notes", "customize"].map((key) => ({ key }));
const keys = (list: { key: string }[]) => list.map((i) => i.key);

describe("rail layout", () => {
  test("default order without a layout", () => {
    expect(keys(arrangeRail(items, undefined))).toEqual(keys(items));
  });

  test("ordered items first, the rest after in default order", () => {
    expect(keys(arrangeRail(items, { order: ["ext:notes", "chats"], hidden: [] }))).toEqual([
      "ext:notes",
      "chats",
      "skills",
      "memory",
      "customize",
    ]);
  });

  test("hidden items are left out, but never Chats or Customize", () => {
    const layout = { order: [], hidden: ["memory", "chats", "customize"] };
    expect(keys(arrangeRail(items, layout))).toEqual(["chats", "skills", "ext:notes", "customize"]);
    expect(arrangeRail(items, layout, { withHidden: true })).toHaveLength(5);
  });

  test("moving an item swaps it with its neighbour and stops at the ends", () => {
    expect(moveRailItem(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveRailItem(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
  });
});

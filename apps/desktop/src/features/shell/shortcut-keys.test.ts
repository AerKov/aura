import { describe, expect, test } from "bun:test";
import { type KeyLike, matchShortcut } from "./shortcut-keys";

const key = (k: Partial<KeyLike>): KeyLike => ({
  key: "",
  code: "",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...k,
});

describe("window manager shortcuts (ADR 0028)", () => {
  test("Mod+arrows focus, Mod+Shift+arrows move, Enter splits, Q closes, H goes home, digits open", () => {
    expect(matchShortcut(key({ key: "ArrowLeft", altKey: true }), "alt", false)).toEqual({
      type: "focus",
      dir: "left",
    });
    expect(
      matchShortcut(key({ key: "ArrowDown", altKey: true, shiftKey: true }), "alt", false),
    ).toEqual({ type: "move", dir: "down" });
    expect(matchShortcut(key({ key: "Enter", altKey: true }), "alt", false)).toEqual({
      type: "split",
      where: "right",
    });
    expect(
      matchShortcut(key({ key: "Enter", altKey: true, shiftKey: true }), "alt", false),
    ).toEqual({ type: "split", where: "below" });
    // By position: Option+Q types "œ" on macOS.
    expect(matchShortcut(key({ key: "œ", code: "KeyQ", altKey: true }), "alt", false)).toEqual({
      type: "close",
    });
    expect(matchShortcut(key({ code: "KeyH", altKey: true }), "alt", false)).toEqual({
      type: "home",
    });
    expect(matchShortcut(key({ key: "¡", code: "Digit1", altKey: true }), "alt", false)).toEqual({
      type: "app",
      index: 0,
    });
  });

  test("only the chosen Mod counts", () => {
    const q = { code: "KeyQ" };
    expect(matchShortcut(key({ ...q, altKey: true }), "ctrl-alt", false)).toBeNull();
    expect(matchShortcut(key({ ...q, altKey: true, ctrlKey: true }), "ctrl-alt", false)).toEqual({
      type: "close",
    });
    expect(matchShortcut(key({ ...q, altKey: true, ctrlKey: true }), "alt", false)).toBeNull();
    expect(matchShortcut(key({ ...q, metaKey: true }), "meta", false)).toEqual({ type: "close" });
    expect(matchShortcut(key({ ...q }), "alt", false)).toBeNull();
  });

  test("in a text field arrows keep moving by word", () => {
    expect(matchShortcut(key({ key: "ArrowLeft", altKey: true }), "alt", true)).toBeNull();
    expect(matchShortcut(key({ code: "KeyQ", altKey: true }), "alt", true)).toEqual({
      type: "close",
    });
  });
});

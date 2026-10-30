import { describe, expect, test } from "bun:test";
import { bulletsOf, plainChanges } from "./plain";

describe("plain changes on approval cards (ADR 0034)", () => {
  test("an agent's bullet list becomes the changes; code lines and bold stay out", () => {
    const reply = [
      "Done. I looked at how the table is built first.",
      "- A new **Email** column in the clients table",
      "* An «Export to CSV» button",
      "1. Existing clients get an empty email",
      "- `main.js` changed",
    ].join("\n");
    expect(bulletsOf(reply)).toEqual([
      "A new Email column in the clients table",
      "An «Export to CSV» button",
      "Existing clients get an empty email",
    ]);
    expect(bulletsOf("No list here.")).toEqual([]);
  });

  test("changes from a tool call are trimmed lines, at most 8", () => {
    expect(plainChanges({ changes: [" one ", "", "two"] })).toEqual(["one", "two"]);
    expect(plainChanges({ changes: Array.from({ length: 12 }, (_, i) => `c${i}`) })).toHaveLength(
      8,
    );
    expect(plainChanges({})).toEqual([]);
  });
});

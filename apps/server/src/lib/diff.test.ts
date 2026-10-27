import { expect, test } from "bun:test";
import { unifiedDiff } from "./diff";

test("no changes gives an empty diff", () => {
  expect(unifiedDiff("a\nb\n", "a\nb\n", "f")).toBe("");
});

test("shows added, removed and changed lines with context", () => {
  const before = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"].join(
    "\n",
  );
  const after = [
    "one",
    "two",
    "THREE",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ].join("\n");
  expect(unifiedDiff(before, after, "skills/x/SKILL.md")).toBe(
    [
      "--- a/skills/x/SKILL.md",
      "+++ b/skills/x/SKILL.md",
      "@@ -1,9 +1,10 @@",
      " one",
      " two",
      "-three",
      "+THREE",
      " four",
      " five",
      " six",
      " seven",
      " eight",
      " nine",
      "+ten",
    ].join("\n"),
  );
});

test("a new file is all additions", () => {
  expect(unifiedDiff("", "a\nb", "f")).toBe("--- a/f\n+++ b/f\n@@ -0,0 +1,2 @@\n+a\n+b");
});

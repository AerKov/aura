import { describe, expect, test } from "bun:test";
import { activeToken, matchAgents } from "./mentions";

const agents = [
  { handle: "orchestrator", name: "Orchestrator", role: "Plans and delegates" },
  { handle: "coder", name: "Coder", role: "Writes the code" },
  { handle: "reviewer", name: "Reviewer", role: "Checks code and runs tests" },
];

describe("mention suggestions", () => {
  test("finds the @word or the leading /word before the caret", () => {
    expect(activeToken("hi @co", 6)).toEqual({ start: 3, query: "co" });
    expect(activeToken("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeToken("/rev", 4)).toEqual({ start: 0, query: "rev" });
    expect(activeToken("mail me@home", 12)).toBeNull();
    expect(activeToken("path /usr/bin", 13)).toBeNull();
    expect(activeToken("@coder done", 11)).toBeNull();
    expect(activeToken("hi @кодер", 9)).toEqual({ start: 3, query: "кодер" });
  });

  test("ranks handle and name prefixes first, then roles", () => {
    expect(matchAgents(agents, "").map((a) => a.handle)).toEqual([
      "coder",
      "orchestrator",
      "reviewer",
    ]);
    expect(matchAgents(agents, "re").map((a) => a.handle)).toEqual(["reviewer"]);
    expect(matchAgents(agents, "tests").map((a) => a.handle)).toEqual(["reviewer"]);
    expect(matchAgents(agents, "code").map((a) => a.handle)).toEqual(["coder", "reviewer"]);
    expect(matchAgents(agents, "zzz")).toEqual([]);
  });
});

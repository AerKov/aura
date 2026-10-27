import { describe, expect, test } from "bun:test";
import { decideToolUse, isInside } from "./confine";

describe("isInside", () => {
  test("accepts paths in the root, rejects escapes", () => {
    expect(isInside("/w/p", "/w/p")).toBe(true);
    expect(isInside("/w/p", "src/a.ts")).toBe(true);
    expect(isInside("/w/p", "/w/p/src/a.ts")).toBe(true);
    expect(isInside("/w/p", "../q/a.ts")).toBe(false);
    expect(isInside("/w/p", "/w/p2/a.ts")).toBe(false);
    expect(isInside("/w/p", "/etc/passwd")).toBe(false);
    expect(isInside("/w/p", "src/../../x")).toBe(false);
  });
});

describe("decideToolUse", () => {
  const base = {
    granted: ["Read", "Write", "Bash"],
    appTools: ["mcp__aura__list_agents"],
    cwd: "/w/p",
  };

  test("allows app tools and granted tools inside the workspace", () => {
    expect(decideToolUse({ ...base, tool: "mcp__aura__list_agents", args: {} }).allow).toBe(true);
    expect(decideToolUse({ ...base, tool: "Write", args: { file_path: "/w/p/a.ts" } }).allow).toBe(
      true,
    );
    expect(decideToolUse({ ...base, tool: "Bash", args: { command: "bun test" } }).allow).toBe(
      true,
    );
  });

  test("denies tools that were not granted", () => {
    expect(decideToolUse({ ...base, tool: "Edit", args: { file_path: "/w/p/a.ts" } })).toEqual({
      allow: false,
      reason: "Edit is not granted to this agent",
    });
    expect(decideToolUse({ ...base, tool: "WebFetch", args: {} }).allow).toBe(false);
  });

  test("denies file access outside the workspace", () => {
    expect(
      decideToolUse({ ...base, tool: "Write", args: { file_path: "/home/u/.bashrc" } }).allow,
    ).toBe(false);
    expect(
      decideToolUse({ ...base, tool: "Read", args: { file_path: "../other/secret" } }).allow,
    ).toBe(false);
    expect(
      decideToolUse({ ...base, tool: "Bash", args: { command: "cat x" }, blockedPath: "/etc" })
        .allow,
    ).toBe(false);
  });
});

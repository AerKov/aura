import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideToolUse, isInside, isInsideReal } from "./confine";

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

describe("blockedPath from Claude Code", () => {
  test("is allowed inside the workspace (the sandbox reports those too), denied outside", () => {
    const root = mkdtempSync(join(tmpdir(), "aura-confine-"));
    const cwd = join(root, "ws");
    const base = { granted: ["Bash"], appTools: [], cwd, tool: "Bash", args: { command: "x" } };
    try {
      expect(decideToolUse({ ...base, blockedPath: join(cwd, "ok.txt") }).allow).toBe(true);
      expect(decideToolUse({ ...base, blockedPath: join(root, "other.txt") }).allow).toBe(false);
      // A symlinked spelling of the workspace counts as inside.
      symlinkSync(root, join(tmpdir(), `aura-link-${process.pid}`));
      const linked = join(tmpdir(), `aura-link-${process.pid}`, "ws", "new.txt");
      expect(isInsideReal(cwd, linked)).toBe(true);
    } finally {
      rmSync(join(tmpdir(), `aura-link-${process.pid}`), { force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});

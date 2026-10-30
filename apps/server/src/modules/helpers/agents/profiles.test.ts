import { describe, expect, test } from "bun:test";
import {
  type AgentProfile,
  ProfileError,
  parseAgentFile,
  serializeAgentFile,
  validateProfile,
} from "./profiles";

const coder: AgentProfile = {
  handle: "coder",
  name: "Coder",
  role: 'Writes code: "small" and tested',
  engine: null,
  model: "claude-sonnet-5-5",
  systemPrompt: "You write code.\n\n---\nSeparators in the body are fine.",
  builtinTools: ["Read", "Write", "Bash"],
  budgetUsd: 2.5,
  skills: ["tdd"],
};

describe("agent files", () => {
  test("round-trips through serialize and parse", () => {
    expect(parseAgentFile("coder", serializeAgentFile(coder))).toEqual(coder);
    const minimal = { ...coder, model: null, builtinTools: [], budgetUsd: null, skills: [] };
    expect(parseAgentFile("coder", serializeAgentFile(minimal))).toEqual(minimal);
  });

  test("parses hand-written YAML", () => {
    const text =
      "---\nname: Reviewer\nrole: Reviews code\ntools: [Read, Grep]\nbudget_usd: 1\n---\nReview carefully.\n";
    const profile = parseAgentFile("reviewer", text);
    expect(profile.builtinTools).toEqual(["Read", "Grep"]);
    expect(profile.budgetUsd).toBe(1);
    expect(profile.systemPrompt).toBe("Review carefully.");
  });

  test("rejects broken files", () => {
    expect(() => parseAgentFile("x1", "no frontmatter")).toThrow(ProfileError);
    expect(() => parseAgentFile("x1", "---\nname: X\n---\nbody")).toThrow(/role/);
    expect(() => parseAgentFile("x1", "---\nname: X\nrole: r\ntools: [Rm]\n---\nbody")).toThrow(
      /tools/,
    );
  });
});

describe("validateProfile", () => {
  const base = { handle: "qa", name: "QA", role: "Tests", systemPrompt: "Test things" };

  test("rejects unsafe values", () => {
    expect(() => validateProfile({ ...base, handle: "../etc" })).toThrow(/handle/);
    expect(() => validateProfile({ ...base, handle: "Bad" })).toThrow(/handle/);
    expect(() => validateProfile({ ...base, model: "x; rm -rf" })).toThrow(/model/);
    expect(() => validateProfile({ ...base, budgetUsd: -1 })).toThrow(/budget/);
    expect(() => validateProfile({ ...base, budgetUsd: Number.POSITIVE_INFINITY })).toThrow(
      /budget/,
    );
    expect(() => validateProfile({ ...base, systemPrompt: "x".repeat(30_000) })).toThrow(/prompt/);
  });

  test("dedupes tools", () => {
    expect(validateProfile({ ...base, tools: ["Read", "Read"] }).builtinTools).toEqual(["Read"]);
  });
});

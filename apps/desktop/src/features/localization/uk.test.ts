import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_APPS, BUILTIN_GROUPS, DEFAULT_APP_GROUP, MODULES } from "@aura/shared";
import { UK } from "./uk";

const SRC = join(import.meta.dir, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("Ukrainian (ADR 0033)", () => {
  test("every text the shell translates has an entry", () => {
    const texts = new Set<string>([
      ...BUILTIN_APPS.flatMap((a) => [a.name, a.description]),
      ...BUILTIN_GROUPS,
      DEFAULT_APP_GROUP,
      ...Object.values(MODULES).map((m) => m.name),
    ]);
    for (const file of sources(SRC)) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("useT")) continue;
      for (const m of text.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) if (m[1]) texts.add(m[1]);
    }
    expect([...texts].filter((t) => !(t in UK))).toEqual([]);
  });

  test("placeholders survive translation", () => {
    for (const [en, uk] of Object.entries(UK)) {
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect({ en, vars: vars(uk) }).toEqual({ en, vars: vars(en) });
    }
  });
});

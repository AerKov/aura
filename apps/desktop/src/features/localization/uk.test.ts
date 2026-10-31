import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_APPS, BUILTIN_GROUPS, DEFAULT_APP_GROUP } from "@aura/shared";
import ts from "typescript";
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
    ]);
    for (const file of sources(SRC)) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("useT") && !text.includes("tr(")) continue;
      for (const m of text.matchAll(/\btr?\(\s*"((?:[^"\\]|\\.)*)"/g))
        if (m[1]) texts.add(JSON.parse(`"${m[1]}"`));
    }
    expect([...texts].filter((t) => !(t in UK))).toEqual([]);
  });

  test("no text in the interface is left out of translation", () => {
    const CODE_TAGS = new Set(["code", "kbd", "pre"]);
    const codeLike = (s: string) =>
      /^[@$~]|=|^(npm|bun|claude|gemini|codex|opencode)\b|^[A-Z_]{3,}$|^\S+\.(json|md|css|js|ts)$|^https?:|^(URL|Bearer)$/.test(
        s,
      );
    const raw: string[] = [];
    for (const file of sources(SRC)) {
      if (!file.endsWith(".tsx") || file.includes("/components/ui/")) continue;
      const sf = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
          const text = node.getText(sf).replace(/\s+/g, " ").trim();
          let inCode = false;
          for (let p: ts.Node | undefined = node.parent; p; p = p.parent)
            if (ts.isJsxElement(p) && CODE_TAGS.has(p.openingElement.tagName.getText(sf)))
              inCode = true;
          if (/[A-Za-z]/.test(text) && !inCode && !codeLike(text))
            raw.push(`${file.slice(SRC.length)}: ${text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(raw).toEqual([]);
  });

  test("placeholders survive translation", () => {
    for (const [en, uk] of Object.entries(UK)) {
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect({ en, vars: vars(uk) }).toEqual({ en, vars: vars(en) });
    }
  });
});

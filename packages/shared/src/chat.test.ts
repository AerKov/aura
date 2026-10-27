import { describe, expect, test } from "bun:test";
import { parseMentions, previewText, SLUG_PATTERN, slugify } from "./chat";

describe("parseMentions", () => {
  test("finds handles in order, unique and lowercase", () => {
    expect(parseMentions("@Coder please ask @reviewer, then @coder again")).toEqual([
      "coder",
      "reviewer",
    ]);
  });

  test("handles punctuation and line starts", () => {
    expect(parseMentions("@orchestrator: hi\n(@analyst) ok @qa-bot.")).toEqual([
      "orchestrator",
      "analyst",
      "qa-bot",
    ]);
  });

  test("ignores code, emails and invalid handles", () => {
    const md = "mail me@example.com `@notme` @a @1x\n```\n@insidecode\n```\n@real";
    expect(parseMentions(md)).toEqual(["real"]);
  });
});

describe("previewText", () => {
  test("strips markdown and collapses whitespace", () => {
    expect(previewText("# Title\n\n**bold** [link](http://x)")).toBe("Title bold link");
  });

  test("replaces code blocks and truncates", () => {
    expect(previewText("see\n```ts\nconst a = 1;\n```")).toBe("see [code]");
    expect(previewText("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
  });
});

describe("slugify", () => {
  test("makes folder-safe slugs", () => {
    expect(slugify("Word Counter CLI!")).toBe("word-counter-cli");
    expect(slugify("  Café --- déjà vu ")).toBe("cafe-deja-vu");
    expect(slugify("Лічильник слів")).toBe("");
    expect(SLUG_PATTERN.test(slugify("x".repeat(80)))).toBe(true);
  });
});

import { expect, test } from "bun:test";
import { highlightMentions } from "./mentions";

test("highlights mentions outside code only", () => {
  expect(highlightMentions("hi @coder, ask @reviewer")).toBe("hi **@coder**, ask **@reviewer**");
  expect(highlightMentions("`@code` and ```\n@block\n``` @x1")).toBe(
    "`@code` and ```\n@block\n``` **@x1**",
  );
  expect(highlightMentions("mail me@example.com")).toBe("mail me@example.com");
  expect(highlightMentions("**@already**")).toBe("**@already**");
});

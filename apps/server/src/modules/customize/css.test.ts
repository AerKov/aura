import { expect, test } from "bun:test";
import { sanitizeCss } from "./css";

test("sanitizeCss removes imports, remote urls and expressions", () => {
  const css = `@import url("https://evil.test/x.css");
body { background: url(https://evil.test/track?c=1) }
.a { background-image: url('data:image/png;base64,AAAA') }
.b { width: expression(alert(1)) }
.c::after { content: "</style><script>" }`;
  const out = sanitizeCss(css);
  expect(out).not.toContain("evil.test");
  expect(out).toContain("url('data:image/png;base64,AAAA')");
  expect(out).not.toMatch(/expression\s*\(alert/);
  expect(out).not.toContain("</style>");
  expect(sanitizeCss(":root { --primary: red; }")).toBe(":root { --primary: red; }");
});

import { expect, test } from "bun:test";
import { detectLanguage } from "./runtime";

test("detectLanguage", () => {
  expect(detectLanguage("Привіт, зроби утиліту")).toBe("Ukrainian");
  expect(detectLanguage("Привет, сделай утилиту быстро")).toBe("Russian");
  expect(detectLanguage("Hello, build a CLI")).toBe("English");
  expect(detectLanguage("ок")).toBeNull();
  expect(detectLanguage("👍")).toBeNull();
});

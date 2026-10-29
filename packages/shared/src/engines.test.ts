import { describe, expect, test } from "bun:test";
import { ENGINE_IDS, FREE_SERVICES, freeServiceOf, pickStartModel } from "./engines";

describe("free services (ADR 0037)", () => {
  test("every service is an engine with an https address and a key page", () => {
    for (const service of FREE_SERVICES) {
      expect(ENGINE_IDS).toContain(service.id);
      expect(service.baseUrl.startsWith("https://")).toBe(true);
      expect(service.keyUrl.startsWith("https://")).toBe(true);
      expect(service.baseUrl.endsWith("/")).toBe(false);
    }
    expect(new Set(FREE_SERVICES.map((s) => s.id)).size).toBe(FREE_SERVICES.length);
    expect(freeServiceOf("claude-code")).toBeUndefined();
  });

  test("the start model is the best preferred one on offer, else the first", () => {
    const groq = freeServiceOf("groq");
    if (!groq) throw new Error("no groq");
    expect(pickStartModel(groq, ["x", "llama-3.3-70b-versatile", "openai/gpt-oss-120b"])).toBe(
      "openai/gpt-oss-120b",
    );
    expect(pickStartModel(groq, ["some-model", "other"])).toBe("some-model");
    expect(pickStartModel(groq, [])).toBeNull();
  });
});

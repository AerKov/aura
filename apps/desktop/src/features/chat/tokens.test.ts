import { describe, expect, test } from "bun:test";
import { parseTokens } from "./tokens";

describe("token limits typed by the user", () => {
  test("accepts K and M suffixes, commas and plain numbers", () => {
    expect(parseTokens("2M")).toBe(2_000_000);
    expect(parseTokens("1,5m")).toBe(1_500_000);
    expect(parseTokens(" 500k ")).toBe(500_000);
    expect(parseTokens("120000")).toBe(120_000);
    expect(parseTokens("lots")).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";
import { isSettingsTab, matchesSearch } from "./apps";

describe("apps on the screen (ADR 0042)", () => {
  test("search looks at the name and the description", () => {
    const crm = { name: "CRM", description: "Clients and deals" };
    expect(matchesSearch(crm, "")).toBe(true);
    expect(matchesSearch(crm, "DEAL")).toBe(true);
    expect(matchesSearch({ ...crm, description: null }, "deal")).toBe(false);
  });

  test("Settings has the AI and History tabs", () => {
    expect(isSettingsTab("ai")).toBe(true);
    expect(isSettingsTab("history")).toBe(true);
    expect(isSettingsTab("helpers")).toBe(false);
  });
});

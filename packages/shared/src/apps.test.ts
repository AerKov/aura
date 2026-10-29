import { describe, expect, test } from "bun:test";
import { BUILTIN_APPS, DEFAULT_APP_GROUP, groupOrder, matchesSearch } from "./apps";
import { PAGE_IDS } from "./layout";

describe("the launcher's catalogue (ADR 0033)", () => {
  test("the user's groups come first, the default one last of them, then the built-in ones", () => {
    expect(groupOrder(["System", "Work", DEFAULT_APP_GROUP, "Agents", "Home", "Work"])).toEqual([
      "Home",
      "Work",
      DEFAULT_APP_GROUP,
      "Agents",
      "System",
    ]);
    // Translated names work the same way.
    expect(groupOrder(["Система", "Робота"], ["Спілкування", "Система"], "Застосунки")).toEqual([
      "Робота",
      "Система",
    ]);
  });

  test("search looks at the name, the description and the group", () => {
    const crm = { name: "CRM", description: "Clients and deals", group: "Work" };
    expect(matchesSearch(crm, "")).toBe(true);
    expect(matchesSearch(crm, "deal")).toBe(true);
    expect(matchesSearch(crm, "WORK")).toBe(true);
    expect(matchesSearch({ ...crm, description: null, group: null }, "deal")).toBe(false);
  });

  test("every built-in page is in the catalogue once, with a description", () => {
    const pages = BUILTIN_APPS.filter((a) => a.app.startsWith("page:")).map((a) => a.app.slice(5));
    expect(pages.sort()).toEqual([...PAGE_IDS].sort());
    expect(new Set(BUILTIN_APPS.map((a) => a.key)).size).toBe(BUILTIN_APPS.length);
    for (const app of BUILTIN_APPS) expect(app.description.length).toBeGreaterThan(10);
  });
});

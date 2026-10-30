import { describe, expect, test } from "bun:test";
import { BUILTIN_APPS, DEFAULT_APP_GROUP, groupOrder, matchesSearch } from "./apps";
import { PAGE_IDS, SETTINGS_TABS, settingsTabOf } from "./layout";

describe("the launcher's catalogue (ADR 0033)", () => {
  test("the user's groups come first, the default one last of them, then the built-in ones", () => {
    expect(
      groupOrder(["Settings", "Work", DEFAULT_APP_GROUP, "Essentials", "Home", "Work"]),
    ).toEqual(["Home", "Work", DEFAULT_APP_GROUP, "Essentials", "Settings"]);
    // Translated names work the same way.
    expect(
      groupOrder(["Налаштування", "Робота"], ["Основне", "Налаштування"], "Застосунки"),
    ).toEqual(["Робота", "Налаштування"]);
  });

  test("search looks at the name, the description and the group", () => {
    const crm = { name: "CRM", description: "Clients and deals", group: "Work" };
    expect(matchesSearch(crm, "")).toBe(true);
    expect(matchesSearch(crm, "deal")).toBe(true);
    expect(matchesSearch(crm, "WORK")).toBe(true);
    expect(matchesSearch({ ...crm, description: null, group: null }, "deal")).toBe(false);
  });

  test("the catalogue lists Chats, Alerts and Settings; the old pages are Settings' tabs", () => {
    const pages = BUILTIN_APPS.filter((a) => a.app.startsWith("page:")).map((a) => a.app.slice(5));
    expect(pages).toEqual(["settings"]);
    // Every page id still opens somewhere (ADR 0039).
    for (const page of PAGE_IDS) expect(SETTINGS_TABS).toContain(settingsTabOf(page));
    expect(settingsTabOf("agents")).toBe("helpers");
    expect(settingsTabOf("engines")).toBe("ai");
    expect(new Set(BUILTIN_APPS.map((a) => a.key)).size).toBe(BUILTIN_APPS.length);
    for (const app of BUILTIN_APPS) expect(app.description.length).toBeGreaterThan(10);
  });
});

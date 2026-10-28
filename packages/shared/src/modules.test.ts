import { describe, expect, test } from "bun:test";
import { defaultModules, moduleOfApp, switchModule } from "./modules";

describe("built-in apps (ADR 0027)", () => {
  test("turning one off turns off what needs it; turning one on turns on what it needs", () => {
    const off = switchModule(defaultModules(), "chats", false);
    expect(off.changed.sort()).toEqual(["alerts", "chats", "jobs", "memory", "skills"]);
    const on = switchModule(off.states, "memory", true);
    expect(on.changed.sort()).toEqual(["chats", "memory"]);
    expect(on.states.skills).toBe(false);
    expect(switchModule(on.states, "memory", true).changed).toEqual([]);
  });

  test("apps belong to modules; the core's own apps to none", () => {
    expect(moduleOfApp("messenger")).toBe("chats");
    expect(moduleOfApp("page:engines")).toBe("chats");
    expect(moduleOfApp("page:skills")).toBe("skills");
    expect(moduleOfApp("home")).toBeNull();
    expect(moduleOfApp("page:catalog")).toBeNull();
    expect(moduleOfApp("ext:crm")).toBeNull();
  });
});

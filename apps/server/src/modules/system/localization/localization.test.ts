import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveLocale } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { FakeProvider } from "../../../providers/fake";
import { createTestApp } from "../../../testing";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("the Localization app (ADR 0033)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("auto follows the system; a choice wins when it is available", () => {
    const available = [{ code: "en" }, { code: "uk" }];
    expect(resolveLocale("auto", ["uk-UA", "en"], available)).toBe("uk");
    expect(resolveLocale("auto", ["de-DE"], available)).toBe("en");
    expect(resolveLocale("en", ["uk"], available)).toBe("en");
    expect(resolveLocale("pl", ["uk"], available)).toBe("uk");
  });

  test("the chosen language reaches agents, apps and the customize state; locale files add more", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    expect((await api.localization.get()).data?.choice).toBe("auto");

    expect((await api.localization.put({ choice: "uk" })).data?.choice).toBe("uk");
    expect((await api.customize.get()).data?.localization.choice).toBe("uk");
    await t.chat.post({ chatId: "direct", author: { kind: "user", id: "owner" }, body: "hello" });
    await Bun.sleep(10);
    await t.runtime.whenIdle();
    // The user wrote in English, but chose Ukrainian.
    expect(provider.calls.at(-1)?.systemPrompt).toContain("writes in Ukrainian");

    await t.apps.create({ name: "Notes" });
    expect(await t.extensions.frame("notes", false, "uk")).toContain('<html lang="uk">');
    expect(await t.extensions.frame("notes", false, '"><script>')).toContain('<html lang="en">');

    expect((await api.localization.put({ choice: "pl" })).status).toBe(400);
    mkdirSync(join(t.dataDir, "locales"), { recursive: true });
    writeFileSync(
      join(t.dataDir, "locales", "pl.json"),
      JSON.stringify({
        name: "Polski",
        englishName: "Polish",
        strings: { "Your apps": "Twoje aplikacje" },
      }),
    );
    expect((await api.localization.get()).data?.available.map((l) => l.code)).toEqual([
      "en",
      "uk",
      "pl",
    ]);
    expect((await api.localization.put({ choice: "pl" })).status).toBe(200);
    expect((await api.localization.strings({ code: "pl" }).get()).data).toEqual({
      "Your apps": "Twoje aplikacje",
    });
    expect(await t.localization.agentLanguage()).toBe("Polish");
  });
});

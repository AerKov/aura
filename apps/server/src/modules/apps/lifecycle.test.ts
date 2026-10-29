import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { commitAll } from "../../lib/git";
import { createTestApp } from "../../testing";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("uninstalling apps with a backup (ADR 0033)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("uninstall keeps code, versions, data and chat text; the backup brings the app back", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const created = (await api.apps.post({ name: "Clients", description: "a client list" })).data;
    const chatId = created?.chatId ?? "";
    const dir = join(t.dataDir, "projects", "clients");
    writeFileSync(join(dir, "main.js"), "export default function activate(ctx) { /* v2 */ }\n");
    await commitAll(dir, "feat: version two");
    await t.appData.insert("clients", "clients", { name: "Petrenko" });
    await t.appData.kvSet("clients", "view", "board");
    t.appSecrets.set("clients", "API_KEY", "k-123");
    const bill = t.files.put(
      { kind: "app", id: "clients" },
      "bill.pdf",
      new TextEncoder().encode("%PDF-1.4"),
    );

    const backup = (await api.apps({ appId: "clients" }).delete()).data;
    expect(backup).toMatchObject({ id: "clients", appName: "Clients", taken: false });
    expect(t.apps.isApp("clients")).toBe(false);
    expect(existsSync(dir)).toBe(false);
    expect(await t.repo.findChat(chatId)).toBeNull();
    expect((await t.extensions.list()).map((e) => e.id)).not.toContain("clients");
    expect(t.appSecrets.names("clients")).toEqual([]);
    // The app's files left with it, and sit in the backup.
    expect(t.files.list({ kind: "app", id: "clients" })).toEqual([]);

    const folder = join(t.dataDir, "backups", "apps", backup?.name ?? "");
    expect(readFileSync(join(folder, "chat.md"), "utf8")).toContain("# The chat of Clients");
    // Secret values never go into a backup.
    expect(readFileSync(join(folder, "data.json"), "utf8")).not.toContain("k-123");
    expect((await api["app-backups"].get()).data?.map((b) => b.id)).toEqual(["clients"]);

    const restored = (await api["app-backups"]({ name: backup?.name ?? "" }).restore.post()).data;
    expect(restored?.id).toBe("clients");
    expect(restored?.chatId).not.toBe(chatId);
    expect(readFileSync(join(dir, "main.js"), "utf8")).toContain("v2");
    const back = t.files.find({ kind: "app", id: "clients" }, bill.id);
    expect(back && readFileSync(back.path, "utf8")).toBe("%PDF-1.4");
    expect((await t.apps.history("clients")).map((v) => v.subject)).toContain("feat: version two");
    expect((await t.appData.list("clients", "clients")).map((r) => r.name)).toEqual(["Petrenko"]);
    expect(await t.appData.kvGet("clients", "view")).toBe("board");
    expect(await t.extensions.info("clients")).toMatchObject({
      enabled: true,
      description: "a client list",
    });

    // The backup stays until the user deletes it; with the app back it cannot be restored twice.
    expect((await api["app-backups"].get()).data?.[0]?.taken).toBe(true);
    expect((await api["app-backups"]({ name: backup?.name ?? "" }).restore.post()).status).toBe(
      400,
    );
    expect((await api["app-backups"]({ name: backup?.name ?? "" }).delete()).status).toBe(200);
    expect((await api["app-backups"].get()).data).toEqual([]);
    expect((await api.apps({ appId: "nope" }).delete()).status).toBe(404);
  });
});

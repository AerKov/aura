import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../../lib/git";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { BUILTIN_PACKS } from "../catalog/packs";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** Installs a built-in pack the way the Catalog screen does: preview, then install that hash. */
async function install(t: TestApp, id: string) {
  const preview = await t.catalog.preview({ id });
  return t.catalog.install({ id }, preview.sha256);
}

describe("app kit, templates and community apps (ADR 0024, phases 26-27)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("every app frame has the kit", async () => {
    t = await createTestApp();
    await t.apps.create({ name: "Board" });
    const frame = await t.extensions.frame("board");
    expect(frame).toContain("window.__auraKit");
    expect(frame).toContain("api.kit = Object.freeze");
  });

  test("a template installs as an app with its chat, data and actions", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    const preview = await t.catalog.preview({ id: "app-crm" });
    expect(preview.contents.apps).toEqual(["crm"]);
    expect(preview.preview).toContain("new app **CRM** with its own chat");
    expect(await install(t, "app-crm")).toContain("app CRM");

    const project = await t.projects.get("crm");
    expect(project).toMatchObject({ kind: "app" });
    const info = await t.extensions.info("crm");
    expect(info).toMatchObject({ enabled: true, icon: "users" });
    const added = await t.appData.insert("crm", "clients", { name: "Petrenko", status: "lead" });
    expect(added.id).toBeTruthy();

    // Agents in its chat get its actions.
    await t.chat.post({
      chatId: project?.chatId ?? "",
      author: { kind: "user", id: "owner" },
      body: "@builder how many clients?",
    });
    await Bun.sleep(30);
    await t.runtime.whenIdle();
    const names = provider.calls.at(-1)?.tools.map((x) => x.name) ?? [];
    expect(names).toContain("app_find_clients");
    expect(names).toContain("app_add_deal");
  });

  test("an update from the author is merged with the user's own changes", async () => {
    t = await createTestApp();
    await install(t, "app-notes");
    const dir = join(t.dataDir, "projects", "notes");
    // The user's change (approved earlier): a line of their own in main.js.
    const mine = readFileSync(join(dir, "main.js"), "utf8").replace(
      'title: "Notes",',
      'title: "My notes",',
    );
    writeFileSync(join(dir, "main.js"), mine);
    await git(dir, ["commit", "-qam", "owner: rename"]);

    // The author ships 1.1.0 with another collection field.
    const raw = BUILTIN_PACKS.find((p) => (p.manifest as { id: string }).id === "app-notes");
    if (!raw) throw new Error("no pack");
    const manifest = JSON.parse(raw.files["apps/notes/manifest.json"] ?? "{}");
    manifest.version = "1.1.0";
    manifest.collections.notes.fields.pinned = "boolean?";
    const files: Record<string, string> = {
      ...raw.files,
      "apps/notes/manifest.json": JSON.stringify(manifest, null, 2),
    };
    const result = await t.apps.installFromPack(
      "notes",
      {
        "manifest.json": files["apps/notes/manifest.json"] ?? "",
        "main.js": files["apps/notes/main.js"] ?? "",
      },
      { id: "app-notes", version: "1.1.0" },
    );
    expect(result).toContain("updated");
    expect(readFileSync(join(dir, "main.js"), "utf8")).toContain('title: "My notes",');
    expect(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).version).toBe("1.1.0");
    expect((await t.extensions.contract("notes")).collections.notes?.fields.pinned).toBeDefined();
    expect((await t.apps.history("notes"))[0]?.subject).toContain("update: app-notes 1.1.0");

    // With a change waiting for approval, an update waits too.
    writeFileSync(join(dir, "styles.css"), "body{}");
    await expect(
      t.apps.installFromPack(
        "notes",
        { "manifest.json": files["apps/notes/manifest.json"] ?? "", "main.js": "" },
        { id: "app-notes", version: "1.2.0" },
      ),
    ).rejects.toThrow("waiting for approval");
  });
});

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../../lib/git";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const BASE = "https://example.com/packs";

const NOTES_MANIFEST = {
  id: "notes",
  name: "Notes",
  version: "1.0.0",
  minAppVersion: "0.25.0",
  permissions: ["ui.panel", "storage"],
  author: "Test",
  description: "Notes as cards.",
  group: "Work",
  icon: "notebook-pen",
  collections: { notes: { fields: { title: "string", body: "string" } } },
  actions: { find_notes: { kind: "list", collection: "notes", description: "Find notes" } },
  provides: ["find_notes"],
};
const NOTES_MAIN = `export default function activate(ctx) {
  ctx.ui.registerPanel({
    title: "Notes",
    render(el) {
      ctx.kit.cards(el, { collection: "notes", title: "title", body: "body" });
    },
  });
}
`;
const CRM_MANIFEST = {
  id: "crm",
  name: "CRM",
  version: "1.0.0",
  minAppVersion: "0.25.0",
  permissions: ["ui.panel", "storage"],
  author: "Test",
  description: "Clients and deals.",
  group: "Work",
  icon: "users",
  collections: {
    clients: { fields: { name: "string", status: "string" } },
    deals: { fields: { title: "string", stage: "string" } },
  },
  actions: {
    find_clients: { kind: "list", collection: "clients", description: "Find clients" },
    add_deal: { kind: "insert", collection: "deals", description: "Add a deal" },
  },
  provides: ["find_clients"],
};
const CRM_MAIN = `export default function activate(ctx) {
  ctx.ui.registerPanel({
    title: "CRM",
    render(el) {
      ctx.kit.table(el, { collection: "clients", columns: [{ field: "name" }] });
    },
  });
}
`;

/** An app pack served by a fake web server: the community way to get an app (phase 27). */
function appPack(app: string, manifest: object, main: string) {
  const packId = `app-${app}`;
  const files = {
    [`${BASE}/${app}/pack.json`]: JSON.stringify({
      id: packId,
      name: app,
      version: "1.0.0",
      description: `The ${app} app.`,
      author: "Test",
      files: [`apps/${app}/manifest.json`, `apps/${app}/main.js`],
    }),
    [`${BASE}/${app}/apps/${app}/manifest.json`]: JSON.stringify(manifest),
    [`${BASE}/${app}/apps/${app}/main.js`]: main,
  };
  return {
    url: `${BASE}/${app}/pack.json`,
    fetchFn: (async (input: string | URL | Request) => {
      const body = files[String(input)];
      return body === undefined ? new Response("not found", { status: 404 }) : new Response(body);
    }) as unknown as typeof fetch,
  };
}

/** Installs a pack the way the Catalog screen does: preview, then install that hash. */
async function install(t: TestApp, url: string) {
  const preview = await t.catalog.preview({ url });
  return t.catalog.install({ url }, preview.sha256);
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
    const crm = appPack("crm", CRM_MANIFEST, CRM_MAIN);
    t = await createTestApp({ provider, fetch: crm.fetchFn });
    const preview = await t.catalog.preview({ url: crm.url });
    expect(preview.contents.apps).toEqual(["crm"]);
    expect(preview.preview).toContain("new app **CRM** with its own chat");
    expect(await install(t, crm.url)).toContain("app CRM");

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
    const notes = appPack("notes", NOTES_MANIFEST, NOTES_MAIN);
    t = await createTestApp({ fetch: notes.fetchFn });
    await install(t, notes.url);
    const dir = join(t.dataDir, "projects", "notes");
    // The user's change (approved earlier): a line of their own in main.js.
    const mine = readFileSync(join(dir, "main.js"), "utf8").replace(
      'title: "Notes",',
      'title: "My notes",',
    );
    writeFileSync(join(dir, "main.js"), mine);
    await git(dir, ["commit", "-qam", "owner: rename"]);

    // The author ships 1.1.0 with another collection field.
    const manifest = structuredClone(NOTES_MANIFEST) as typeof NOTES_MANIFEST & {
      collections: { notes: { fields: Record<string, string> } };
    };
    manifest.version = "1.1.0";
    manifest.collections.notes.fields.pinned = "boolean?";
    const files: Record<string, string> = {
      "apps/notes/manifest.json": JSON.stringify(manifest, null, 2),
      "apps/notes/main.js": NOTES_MAIN,
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

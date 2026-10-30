import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { git } from "../../../lib/git";
import { FakeProvider } from "../../../providers/fake";
import { createTestApp } from "../../../testing";
import { validateContract } from "./contract";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

const CRM = {
  collections: {
    clients: { fields: { name: "string", email: "string?", status: "string" } },
  },
  actions: {
    list_clients: { kind: "list", collection: "clients", description: "Find clients" },
    add_client: { kind: "insert", collection: "clients", description: "Add a client" },
    remove_client: { kind: "delete", collection: "clients", description: "Remove a client" },
  },
  provides: ["list_clients"],
};

/** Creates an app and approves a manifest with these data and actions, as the user would. */
async function appWith(t: TestApp, id: string, extra: Record<string, unknown>) {
  const { chat } = await t.apps.create({ name: id, id });
  const file = join(t.dataDir, "projects", id, "manifest.json");
  const manifest = { ...JSON.parse(readFileSync(file, "utf8")), ...extra };
  writeFileSync(file, JSON.stringify(manifest, null, 2));
  await git(join(t.dataDir, "projects", id), ["commit", "-qam", "feat: data"]);
  await t.extensions.regrant(id);
  return chat;
}

describe("app data and actions (ADR 0024, phases 24-25)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("contracts are validated", () => {
    expect(validateContract(CRM).provides).toEqual(["list_clients"]);
    expect(() => validateContract({ collections: { c: { fields: { name: "text" } } } })).toThrow(
      "type must be one of",
    );
    expect(() =>
      validateContract({
        ...CRM,
        actions: { x: { kind: "list", collection: "nope", description: "d" } },
      }),
    ).toThrow("collection");
    expect(() => validateContract({ ...CRM, provides: ["secret_action"] })).toThrow("provides");
    expect(() => validateContract({ uses: ["not-an-action"] })).toThrow("uses");
  });

  test("an app's records live in its own store, checked against its schema", async () => {
    t = await createTestApp();
    await appWith(t, "crm", CRM);
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const data = api.extensions({ extensionId: "crm" }).data;

    const added = await data.post({
      op: "insert",
      collection: "clients",
      record: { name: "Petrenko", status: "lead" },
    });
    const record = (added.data as { result: { id: string } } | null)?.result;
    expect(record?.id).toBeTruthy();
    expect(
      (await data.post({ op: "insert", collection: "clients", record: { name: 1 } })).status,
    ).toBe(400);
    expect(
      (
        await data.post({
          op: "insert",
          collection: "clients",
          record: { name: "X", status: "a", age: 3 },
        })
      ).status,
    ).toBe(400);
    expect((await data.post({ op: "list", collection: "deals" })).status).toBe(400);

    await data.post({
      op: "update",
      collection: "clients",
      id: record?.id,
      patch: { status: "won" },
    });
    const listed = await data.post({
      op: "list",
      collection: "clients",
      query: { where: { status: "won" } },
    });
    expect((listed.data as { result: unknown[] }).result).toHaveLength(1);

    // Not in Aura's main database.
    const [rows] = await t.db.surreal.query<[unknown[]]>("SELECT * FROM extension_data").collect();
    expect(rows ?? []).toHaveLength(0);
    expect((await api.apps({ appId: "crm" }).data.get()).data).toEqual({
      store: "database",
      collections: [{ name: "clients", count: 1 }],
    });
  });

  test("the user moves an app's data to files, exports it and deletes it", async () => {
    t = await createTestApp();
    await appWith(t, "crm", CRM);
    await t.appData.insert("crm", "clients", { name: "Petrenko", status: "lead" });
    await t.appData.kvSet("crm", "theme", "dark");
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });

    const moved = await api.apps({ appId: "crm" }).data.store.put({ store: "files" });
    expect(moved.data?.store).toBe("files");
    const file = join(t.dataDir, "projects", "crm", "data", "clients.json");
    expect(JSON.parse(readFileSync(file, "utf8"))[0].name).toBe("Petrenko");
    expect(await t.appData.kvGet("crm", "theme")).toBe("dark");
    // Data files are not part of the app's code versions.
    expect(await git(join(t.dataDir, "projects", "crm"), ["status", "--porcelain"])).toBe("");

    const exported = await api.apps({ appId: "crm" }).data.export.get();
    expect(exported.data?.collections.clients?.[0]?.name).toBe("Petrenko");
    await api.apps({ appId: "crm" }).data.delete();
    expect(existsSync(file)).toBe(false);
  });

  test("agents in the app's chat use its actions; deleting asks first", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    const chat = await appWith(t, "crm", CRM);
    await t.chat.post({ chatId: chat.id, author: owner, body: "@builder add Petrenko" });
    await Bun.sleep(30);
    await t.runtime.whenIdle();
    const tools = provider.calls.at(-1)?.tools ?? [];
    const add = tools.find((x) => x.name === "app_add_client");
    const list = tools.find((x) => x.name === "app_list_clients");
    const remove = tools.find((x) => x.name === "app_remove_client");
    const added = JSON.parse(
      (await add?.handler({ record: { name: "Petrenko", status: "lead" } }))?.text ?? "{}",
    );
    expect(added.name).toBe("Petrenko");
    expect((await list?.handler({ search: "petr" }))?.text).toContain("Petrenko");

    const asked = await remove?.handler({ id: added.id, why: "duplicate" });
    expect(asked?.text).toContain("Approval requested");
    expect(await t.appData.count("crm", "clients")).toBe(1);
    const [card] = await t.approvals.listPending();
    if (!card) throw new Error("no card");
    await t.approvals.decide(card.id, true, "owner");
    expect(await t.appData.count("crm", "clients")).toBe(0);
  });

  test("another app calls only provided actions it was granted", async () => {
    t = await createTestApp();
    await appWith(t, "crm", CRM);
    await t.appData.insert("crm", "clients", { name: "Petrenko", status: "lead" });
    await appWith(t, "board", {
      permissions: ["ui.panel", "storage", "apps.call"],
      uses: ["crm.list_clients", "crm.add_client"],
    });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const call = api.extensions({ extensionId: "board" }).call;
    const listed = await call.post({ app: "crm", action: "list_clients", input: {} });
    expect(JSON.stringify(listed.data)).toContain("Petrenko");
    // Granted by the user but not offered by crm.
    expect((await call.post({ app: "crm", action: "add_client", input: {} })).status).toBe(403);
    // Offered but not granted to this app.
    const other = api.extensions({ extensionId: "crm" }).call;
    expect((await other.post({ app: "board", action: "x" })).status).toBe(403);
  });
});

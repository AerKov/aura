import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { FakeProvider } from "../../../providers/fake";
import { createTestApp } from "../../../testing";
import { BUILDER_HANDLE } from "./service";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

async function settle(t: TestApp) {
  await Bun.sleep(30);
  await t.runtime.whenIdle();
}

/** What the builder "did" in a run: files changed in the app's folder. */
function edit(t: TestApp, file: string, content: string) {
  writeFileSync(join(t.dataDir, "projects", "clients", file), content);
}

async function wakeBuilder(t: TestApp, chatId: string, body = "@builder add a list") {
  await t.chat.post({ chatId, author: owner, body });
  await settle(t);
}

describe("apps with chats (ADR 0024)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("the user creates an app: a project with its chat, @builder, and a running scaffold", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const res = await api.apps.post({ name: "Clients" });
    expect(res.data).toMatchObject({ id: "clients" });
    const project = await t.projects.get("clients");
    expect(project).toMatchObject({ kind: "app", app: "clients" });
    expect(await t.agents.get(BUILDER_HANDLE)).not.toBeNull();
    // No description: nobody is woken yet.
    expect(provider.calls).toHaveLength(0);

    const info = await t.extensions.info("clients");
    expect(info).toMatchObject({ enabled: true, permissions: ["ui.panel", "storage"] });
    expect(info.app).toMatchObject({ chatId: res.data?.chatId, draft: false });
    const frame = await t.extensions.frame("clients");
    expect(frame).toContain("This app is empty");

    expect((await api.apps.post({ name: "Clients" })).status).toBe(400);
  });

  test("an agent's change waits as a draft; approving it goes live; restoring goes back", async () => {
    t = await createTestApp({ provider: new FakeProvider() });
    const created = await t.apps.create({ name: "Clients" });
    const chatId = created.chat.id;
    const first = (await t.apps.history("clients"))[0]?.hash ?? "";

    edit(
      t,
      "main.js",
      "export default (ctx) => ctx.ui.registerPanel({ title: 'v2', render() {} });",
    );
    await wakeBuilder(t, chatId);

    // Not live yet: the app still runs the scaffold; the draft can be previewed.
    expect(await t.extensions.frame("clients")).toContain("This app is empty");
    expect(await t.extensions.frame("clients", true)).toContain("v2");
    expect((await t.extensions.info("clients")).app?.draft).toBe(true);

    const [card] = await t.approvals.listPending();
    expect(card).toMatchObject({ kind: "app_change", chatId });
    expect(card?.preview).toContain("main.js");
    const message = card?.messageId ? await t.repo.getMessage(card.messageId) : null;
    expect(message?.chatId).toBe(chatId);
    // A second run without new changes does not ask twice.
    await wakeBuilder(t, chatId, "@builder anything else?");
    expect(await t.approvals.listPending()).toHaveLength(1);

    if (!card) throw new Error("no card");
    const decided = await t.approvals.decide(card.id, true, "owner");
    expect(decided.status).toBe("approved");
    expect(await t.extensions.frame("clients")).toContain("v2");
    expect((await t.extensions.info("clients")).app?.draft).toBe(false);

    const history = await t.apps.history("clients");
    expect(history[0]?.subject).toContain("builder:");
    await t.apps.restore("clients", first);
    expect(await t.extensions.frame("clients")).toContain("This app is empty");
    expect((await t.apps.history("clients"))[0]?.subject).toBe(`revert: back to ${first}`);
  });

  test("rejecting discards the draft; a card that is out of date is refused", async () => {
    t = await createTestApp({ provider: new FakeProvider() });
    const { chat } = await t.apps.create({ name: "Clients" });
    const dir = join(t.dataDir, "projects", "clients");

    edit(t, "styles.css", "body { color: red; }");
    await wakeBuilder(t, chat.id);
    const [card] = await t.approvals.listPending();
    if (!card) throw new Error("no card");
    await t.approvals.decide(card.id, false, "owner");
    expect(readFileSync(join(dir, "styles.css"), "utf8")).not.toContain("red");

    edit(t, "styles.css", "body { color: blue; }");
    await wakeBuilder(t, chat.id);
    const [stale] = await t.approvals.listPending();
    edit(t, "styles.css", "body { color: green; }");
    if (!stale) throw new Error("no card");
    const result = await t.approvals.decide(stale.id, true, "owner");
    expect(result.status).toBe("failed");
    expect(result.result).toContain("changed since");
  });

  test("a change that asks for more permissions says so, and approving grants them", async () => {
    t = await createTestApp({ provider: new FakeProvider() });
    const { chat } = await t.apps.create({ name: "Clients" });
    const manifest = JSON.parse(
      readFileSync(join(t.dataDir, "projects", "clients", "manifest.json"), "utf8"),
    );
    manifest.permissions.push("net");
    manifest.hosts = ["crm.example.com"];
    edit(t, "manifest.json", JSON.stringify(manifest, null, 2));
    await wakeBuilder(t, chat.id);
    const [card] = await t.approvals.listPending();
    expect(card?.preview).toContain("It asks for more");
    expect(card?.preview).toContain("crm.example.com");
    // Until approved, the app keeps what it had.
    expect((await t.extensions.info("clients")).hosts).toEqual([]);
    if (!card) throw new Error("no card");
    await t.approvals.decide(card.id, true, "owner");
    expect((await t.extensions.info("clients")).hosts).toEqual(["crm.example.com"]);
  });

  test("the orchestrator proposes an app; approving creates it and starts the builder", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: owner, body: "I need a client list" });
    await settle(t);
    const tool = provider.calls[0]?.tools.find((x) => x.name === "create_app");
    const answer = await tool?.handler({
      name: "Clients",
      description: "A list of clients with name, email and status.",
      why: "you asked for a client list",
    });
    expect(answer?.text).toContain("Approval requested");
    const [card] = await t.approvals.listPending();
    if (!card) throw new Error("no card");
    const before = provider.calls.length;
    await t.approvals.decide(card.id, true, "owner");
    await settle(t);
    expect(await t.projects.get("clients")).toMatchObject({ kind: "app" });
    const builderRun = provider.calls
      .slice(before)
      .find((c) => c.systemPrompt.includes("Aura app"));
    expect(builderRun?.prompt).toContain("A list of clients");
  });
});

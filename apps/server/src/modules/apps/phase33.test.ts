import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionPermission } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { git } from "../../lib/git";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { EventHub } from "../realtime/hub";
import { AppSnapshots, describeSnapshot } from "./snapshots";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

async function install(t: TestApp, permissions: ExtensionPermission[]) {
  const dir = join(t.dataDir, "extensions", "probe");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      id: "probe",
      name: "Probe",
      version: "1.0.0",
      minAppVersion: "0.1.0",
      author: "me",
      permissions,
    }),
  );
  writeFileSync(join(dir, "main.js"), "export default () => {}");
  await git(t.dataDir, ["add", "-A"]);
  await git(t.dataDir, ["commit", "-m", "add probe"]);
  await t.extensions.setEnabled("probe", true);
}

describe("phase 33: apps post alerts, the orchestrator relays, agents see apps", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("an app with alerts.write posts an alert card like monitoring does (WISH-7)", async () => {
    t = await createTestApp();
    await install(t, ["ui.panel", "alerts.write"]);
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const post = api.extensions({ extensionId: "probe" }).alerts;
    const first = await post.post({ title: "TEST ONLY", summary: "sample", severity: "info" });
    expect(first.data).toMatchObject({ deduplicated: false, triaged: false });
    const again = await post.post({ title: "TEST ONLY", summary: "sample", severity: "info" });
    expect(again.data?.deduplicated).toBe(true);
    const [card] = (await t.repo.listMessages("system", { limit: 5 })).filter((m) => m.card);
    expect(card?.author).toEqual({ kind: "bot", id: "monitor:app:probe" });
    expect(card?.card).toMatchObject({
      type: "alert",
      source: "app:probe",
      title: "TEST ONLY",
      count: 2,
    });

    await t.modules.set("alerts", false);
    expect((await post.post({ title: "x" })).status).toBe(404);
  });

  test("without alerts.write an app cannot post alerts", async () => {
    t = await createTestApp();
    await install(t, ["ui.panel", "alerts.read"]);
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    expect(
      (await api.extensions({ extensionId: "probe" }).alerts.post({ title: "x" })).status,
    ).toBe(403);
  });

  test("the orchestrator posts into its other chats only on the user's request (WISH-8)", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    await t.agents.create({
      handle: "coder",
      name: "Coder",
      role: "r",
      engine: null,
      model: null,
      systemPrompt: "p",
      builtinTools: [],
      budgetUsd: null,
      skills: [],
    });
    const { chat: project } = await t.projects.create({
      name: "Site",
      slug: "site",
      brief: "@coder builds a site",
      agents: ["coder"],
    });
    await t.chat.post({ chatId: "direct", author: owner, body: "tell the Site chat: deploy at 5" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const tools = provider.calls.at(-1)?.tools ?? [];
    const list = await tools.find((x) => x.name === "list_my_chats")?.handler({});
    expect(list?.text).toContain(`${project.id}: Site`);
    const post = tools.find((x) => x.name === "post_to_chat");
    const res = await post?.handler({ chat: project.id, message: "Deploy at 5." });
    expect(res?.isError).toBeFalsy();
    const [posted] = (await t.repo.listMessages(project.id, { limit: 20 })).slice(-1);
    expect(posted?.author).toEqual({ kind: "agent", id: "orchestrator" });
    expect(posted?.body).toContain("_Sent at the user's request from “");
    expect((await post?.handler({ chat: "nope", message: "x" }))?.isError).toBe(true);

    // An alert run (not the user) cannot use it.
    await t.alerts.ingest("uptime", { title: "Down", severity: "critical" });
    const triageCall = async () => {
      for (let i = 0; i < 150; i++) {
        const call = provider.calls.find((c) => c.prompt.includes("Alert from uptime"));
        if (call) return call;
        await Bun.sleep(100);
      }
      throw new Error("no triage run");
    };
    const triage = (await triageCall()).tools.find((x) => x.name === "post_to_chat");
    expect((await triage?.handler({ chat: project.id, message: "x" }))?.text).toContain(
      "only on the user's own request",
    );
  });

  test("an agent sees an app as the user sees it, or learns it is not open (WISH-2)", async () => {
    const hub = new EventHub();
    const snapshots = new AppSnapshots({ hub, waitMs: 50 });
    const off = hub.subscribe((e) => {
      if (e.type === "app.snapshot")
        snapshots.answer(e.app, e.requestId, {
          draft: true,
          width: 800.4,
          height: 600,
          outline: "# Clients\n[button: Add]",
          errors: ["boom"],
        });
    });
    const seen = await snapshots.request("crm");
    off();
    expect(seen).toMatchObject({ draft: true, width: 800, outline: "# Clients\n[button: Add]" });
    expect(describeSnapshot("crm", seen)).toContain("your change waiting for approval");
    expect(await snapshots.request("crm")).toBeNull();
    expect(describeSnapshot("crm", null)).toContain("is not open");
    expect(
      snapshots.answer("crm", "unknown", {
        draft: false,
        width: 1,
        height: 1,
        outline: "",
        errors: [],
      }),
    ).toBe(false);
  });
});

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { git } from "../../lib/git";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { ModuleService } from "./modules";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

describe("built-in apps on and off (ADR 0027)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("turning Chats off closes its routes and what needs it; the core keeps working", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const res = await api.modules({ moduleId: "chats" }).put({ enabled: false });
    expect(res.data?.changed.sort()).toEqual(["alerts", "chats", "jobs", "memory", "skills"]);

    expect((await api.chats.get()).status).toBe(404);
    expect(JSON.stringify((await api.skills.get()).error?.value)).toContain("Skills is turned off");
    expect((await api.memory.get({ query: {} })).status).toBe(404);
    // The core: layout, catalog, customize, approvals.
    expect((await api.layout.get()).status).toBe(200);
    expect((await api.catalog.get()).status).toBe(200);
    expect((await api.customize.get()).data?.modules).toMatchObject({
      chats: false,
      integrations: true,
    });
    expect((await api.approvals.get()).status).toBe(200);

    // Config in files, every change a commit.
    const file = JSON.parse(readFileSync(join(t.dataDir, "modules.json"), "utf8"));
    expect(file.off.sort()).toEqual(["alerts", "chats", "jobs", "memory", "skills"]);
    expect(await git(t.dataDir, ["log", "-1", "--format=%s"])).toContain("chore: turn off Chats");
    // A restart reads it back.
    expect(new ModuleService({ dataDir: t.dataDir }).enabled("chats")).toBe(false);

    expect((await api.modules({ moduleId: "nope" }).put({ enabled: true })).status).toBe(404);
  });

  test("with Chats off no message wakes an agent; on again, they answer", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    await t.modules.set("chats", false);
    await t.chat.post({ chatId: "direct", author: owner, body: "hello?" });
    await Bun.sleep(30);
    await t.runtime.whenIdle();
    expect(provider.calls).toHaveLength(0);

    await t.modules.set("chats", true);
    await t.chat.post({ chatId: "direct", author: owner, body: "hello again" });
    await Bun.sleep(30);
    await t.runtime.whenIdle();
    expect(provider.calls).toHaveLength(1);
    // Memory, Skills, Schedule were turned off with Chats and stay off: no tools for them.
    const tools = (provider.calls[0]?.tools ?? []).map((x) => x.name);
    expect(tools).not.toContain("remember");
    expect(tools).not.toContain("schedule_job");
    expect(tools).not.toContain("propose_skill_change");
    expect(tools).toContain("set_layout");

    await t.modules.set("memory", true);
    await t.chat.post({ chatId: "direct", author: owner, body: "and now?" });
    await Bun.sleep(30);
    await t.runtime.whenIdle();
    expect((provider.calls.at(-1)?.tools ?? []).map((x) => x.name)).toContain("remember");
  });

  test("with Schedule off due jobs wait", async () => {
    t = await createTestApp();
    await t.modules.set("jobs", false);
    expect(await t.jobs.tick()).toBe(0);
  });
});

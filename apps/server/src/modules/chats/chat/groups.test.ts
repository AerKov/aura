import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { createTestApp } from "../../../testing";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("groups and deleting chats (ADR 0035)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("the user makes a group with chosen helpers and deletes it", async () => {
    t = await createTestApp();
    await t.agents.create({
      handle: "tester",
      name: "Tester",
      role: "runs checks",
      engine: null,
      model: null,
      systemPrompt: "p",
      builtinTools: [],
      budgetUsd: null,
      skills: [],
    });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });

    expect((await api.chats.post({ title: "  " })).status).toBe(400);
    expect((await api.chats.post({ title: "Team", agents: ["nobody"] })).status).toBe(404);

    const made = await api.chats.post({ title: "Planning", agents: ["tester", "tester"] });
    const chat = made.data;
    expect(chat).toMatchObject({ kind: "group", title: "Planning", projectId: null });
    const members = (await t.repo.members(chat?.id ?? "")).map((m) => m.participant.id);
    expect(members.sort()).toEqual(["orchestrator", "owner", "tester"]);

    t.files.put({ kind: "chat", id: chat?.id ?? "" }, "plan.txt", new TextEncoder().encode("x"));
    const removed = await api.chats({ chatId: chat?.id ?? "" }).delete();
    expect(t.files.list({ kind: "chat", id: chat?.id ?? "" })).toEqual([]);
    expect(removed.status).toBe(200);
    expect(await t.repo.findChat(chat?.id ?? "")).toBeNull();
    expect((await api.chats({ chatId: chat?.id ?? "" }).delete()).status).toBe(404);
  });

  test("the chat with the Helper and the alerts cannot be deleted", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    expect((await api.chats({ chatId: "direct" }).delete()).status).toBe(400);
    expect((await api.chats({ chatId: "system" }).delete()).status).toBe(400);
  });

  test("deleting a project's chat removes the project and keeps its files", async () => {
    t = await createTestApp();
    await t.agents.create({
      handle: "tester",
      name: "Tester",
      role: "runs checks",
      engine: null,
      model: null,
      systemPrompt: "p",
      builtinTools: [],
      budgetUsd: null,
      skills: [],
    });
    const { project, chat } = await t.projects.create({
      name: "Website",
      brief: "@tester build a site",
      agents: ["tester"],
      startWith: "tester",
      kickoff: false,
    });
    const workspace = join(t.dataDir, "projects", project.id);
    expect(existsSync(workspace)).toBe(true);
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });

    expect((await api.chats({ chatId: chat.id }).delete()).status).toBe(200);
    expect(await t.projects.get(project.id)).toBeNull();
    expect(existsSync(workspace)).toBe(false);
    const kept = readdirSync(join(t.dataDir, "backups", "projects"));
    expect(kept).toHaveLength(1);
    expect(kept[0]).toStartWith("website-");
  });

  test("an app's chat goes with the app, not on its own", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const { chatId } = (await api.apps.post({ name: "Clients" })).data ?? { chatId: "" };
    expect((await api.chats({ chatId }).delete()).status).toBe(400);
    expect(await t.repo.findChat(chatId)).not.toBeNull();
  });
});

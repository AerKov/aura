import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { createTestApp } from "../../../testing";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("helpers in a chat (ADR 0034)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("the user adds and removes a helper in an app's chat; each change is a line in it", async () => {
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
    const { chatId } = (await api.apps.post({ name: "Clients" })).data ?? { chatId: "" };
    const team = (handles: { participant: { id: string } }[] | undefined) =>
      (handles ?? []).map((m) => m.participant.id);

    const added = await api.chats({ chatId }).agents({ handle: "tester" }).put();
    expect(team(added.data ?? undefined)).toContain("tester");
    // Adding twice changes nothing and posts nothing new.
    await api.chats({ chatId }).agents({ handle: "tester" }).put();
    const removed = await api.chats({ chatId }).agents({ handle: "tester" }).delete();
    expect(team(removed.data ?? undefined)).not.toContain("tester");
    const lines = (await t.repo.listMessages(chatId, { limit: 50 }))
      .filter((m) => m.kind === "system")
      .map((m) => m.body);
    expect(lines.filter((l) => l.includes("@tester"))).toEqual([
      "@tester joined the chat.",
      "@tester left the chat.",
    ]);

    expect((await api.chats({ chatId }).agents({ handle: "orchestrator" }).delete()).status).toBe(
      400,
    );
    expect((await api.chats({ chatId }).agents({ handle: "nobody" }).put()).status).toBe(404);
    expect((await api.chats({ chatId: "direct" }).agents({ handle: "tester" }).put()).status).toBe(
      404,
    );
  });
});

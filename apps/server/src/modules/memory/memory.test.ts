import { afterEach, describe, expect, test } from "bun:test";
import type { Chat } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { toolsFor } from "../agents/tools";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const projectChat: Chat = {
  id: "proj-chat",
  kind: "group",
  title: "Temp CLI",
  projectId: "temp-cli",
  createdAt: new Date().toISOString(),
  lastMessageAt: null,
  lastMessagePreview: null,
};

/** A fake Ollama that embeds by keyword concepts and records requests. */
function fakeOllama() {
  const requests: { url: string; body: unknown }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, body });
    if (url.endsWith("/v1/embeddings")) {
      const texts = (body as { input: string[] }).input;
      return Response.json({
        data: texts.map((t) => ({
          embedding: [/deploy|деплой|release/i.test(t) ? 1 : 0.01, 0.01],
        })),
      });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { requests, fetchFn };
}

describe("agent memory", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  const tool = (app: TestApp, name: string, chat: Chat, handle = "orchestrator") => {
    const found = toolsFor(app.toolDeps, { handle, chat, depth: 0 }).find((x) => x.name === name);
    if (!found) throw new Error(`no tool ${name}`);
    return found;
  };

  test("agents remember, recall and forget within their own scope", async () => {
    t = await createTestApp();
    const direct = await t.repo.getChat("direct");
    if (!direct) throw new Error("no direct chat");

    expect(
      (await tool(t, "remember", direct).handler({ text: "The user likes short answers" })).text,
    ).toMatch(/Remembered as a agent note/);
    expect(
      (await tool(t, "remember", direct).handler({ text: "x", scope: "project" })).isError,
    ).toBe(true);
    await tool(t, "remember", projectChat, "coder").handler({ text: "Deploy target is fly.io" });
    const own = await tool(t, "remember", projectChat, "coder").handler({
      text: "I use tabs",
      scope: "agent",
    });
    expect(own.text).toMatch(/agent note/);

    const recall = await tool(t, "recall", projectChat, "reviewer").handler({
      query: "where do we deploy",
    });
    expect(recall.text).toContain("Deploy target is fly.io (project note by @coder");
    // The reviewer sees the project's notes, not the coder's own.
    expect((await tool(t, "recall", projectChat, "reviewer").handler({ query: "tabs" })).text).toBe(
      "Nothing found.",
    );

    const coderNote = (await t.memory.list({ owner: { scope: "agent", owner: "coder" } }))[0];
    const forgetOther = await tool(t, "forget", projectChat, "reviewer").handler({
      id: coderNote?.id,
    });
    expect(forgetOther.isError).toBe(true);
    expect(
      (await tool(t, "forget", projectChat, "coder").handler({ id: coderNote?.id })).text,
    ).toBe("Forgot: I use tabs");

    // A run can save only so many notes.
    const remember = tool(t, "remember", direct);
    for (let i = 0; i < 10; i++) await remember.handler({ text: `fact number ${i} is ${i * 7}` });
    expect((await remember.handler({ text: "one fact too many" })).isError).toBe(true);
  });

  test("relevant notes reach the agent's instructions", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    await t.memory.save({
      scope: "agent",
      owner: "orchestrator",
      text: "The user deploys to fly.io",
      author: "orchestrator",
    });
    await t.memory.save({
      scope: "agent",
      owner: "coder",
      text: "Coder secret preference",
      author: "coder",
    });
    await t.chat.post({
      chatId: "direct",
      author: { kind: "user", id: "owner" },
      body: "how should we deploy this?",
    });
    await Bun.sleep(10);
    await t.runtime.whenIdle();
    const system = provider.calls.at(-1)?.systemPrompt ?? "";
    expect(system).toContain("## What you remember");
    expect(system).toContain("The user deploys to fly.io");
    expect(system).not.toContain("Coder secret preference");
    expect(provider.calls.at(-1)?.tools.map((x) => x.name)).toEqual(
      expect.arrayContaining(["remember", "recall", "forget"]),
    );
  });

  test("the user lists, searches and deletes notes; semantic search through an embedding model", async () => {
    const ollama = fakeOllama();
    t = await createTestApp({ fetch: ollama.fetchFn });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    await t.memory.save({
      scope: "project",
      owner: "temp-cli",
      text: "Деплой робимо через flyctl",
      author: "coder",
    });
    await t.memory.save({
      scope: "agent",
      owner: "coder",
      text: "Tests use bun test",
      author: "coder",
    });

    expect((await api.memory.get({ query: {} })).data).toHaveLength(2);
    expect((await api.memory.get({ query: { q: "bun" } })).data?.[0]?.text).toBe(
      "Tests use bun test",
    );
    expect((await api.memory.get({ query: { q: "release process" } })).data).toEqual([]);

    // Turn on semantic search with an Ollama embedding model and index existing notes.
    const settings = await api.engines.settings.put({
      memoryEngine: "ollama",
      memoryModel: "nomic-embed-text",
    });
    expect(settings.data?.memory).toEqual({ engine: "ollama", model: "nomic-embed-text" });
    expect((await api.memory.reindex.post()).data).toEqual({ indexed: 2 });
    const found = (await api.memory.get({ query: { q: "release process" } })).data;
    expect(found?.[0]?.text).toBe("Деплой робимо через flyctl");
    expect(found?.[0]?.semantic).toBe(true);
    expect(ollama.requests.find((r) => r.url.endsWith("/embeddings"))).toMatchObject({
      url: "http://127.0.0.1:11434/v1/embeddings",
      body: { model: "nomic-embed-text" },
    });

    const id = found?.[0]?.id ?? "";
    expect((await api.memory({ id }).delete()).data).toEqual({ deleted: true });
    expect((await api.memory({ id }).delete()).status).toBe(404);
    expect(
      (await api.engines.settings.put({ memoryEngine: null, memoryModel: null })).data?.memory,
    ).toEqual({
      engine: null,
      model: null,
    });
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { git } from "../../../lib/git";
import { createTestApp } from "../../../testing";
import { parseSettings } from "./settings";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const KEY = "sk-test-secret-key";

/** A fake network: Ollama endpoints, recording every request. */
function fakeNetwork() {
  const calls: { url: string; auth: string | null; body: unknown }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      auth: headers.get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (url.endsWith("/api/tags")) return Response.json({ models: [{ name: "qwen3:8b" }] });
    if (url.endsWith("/chat/completions")) {
      const text = `data: ${JSON.stringify({ choices: [{ delta: { content: "Привіт з Ollama" } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(text, { headers: { "content-type": "text/event-stream" } });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe("agent engines", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("lists engines, stores the API key outside git and never returns it", async () => {
    const net = fakeNetwork();
    t = await createTestApp({ fetch: net.fetchFn });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });

    const before = await api.engines.get();
    expect(before.data?.default).toBe("claude-code");
    // Local AI leads, your own agent apps come last.
    expect(before.data?.engines.map((e) => e.id)).toEqual([
      "llama-cpp",
      "ollama",
      "openai-compatible",
      "claude-code",
    ]);
    expect(before.data?.engines.find((e) => e.id === "ollama")?.status).toEqual({
      ok: true,
      detail: "1 local model",
    });

    expect((await api.engines({ engine: "openai-compatible" }).key.put({ key: KEY })).data).toEqual(
      { hasKey: true },
    );
    const secrets = join(t.dataDir, "state", "secrets.json");
    expect(statSync(secrets).mode & 0o777).toBe(0o600);
    expect(readFileSync(secrets, "utf8")).toContain(KEY);
    expect(await git(t.dataDir, ["ls-files"])).not.toContain("secrets");

    const after = await api.engines.get();
    expect(JSON.stringify(after.data)).not.toContain(KEY);
    expect(after.data?.engines.find((e) => e.id === "openai-compatible")).toMatchObject({
      hasKey: true,
    });

    // Keys only go to their own service.
    expect(net.calls.filter((c) => c.url.includes("11434")).every((c) => c.auth === null)).toBe(
      true,
    );

    expect((await api.engines({ engine: "ollama" }).key.put({ key: KEY })).status).toBe(422);
  });

  test("engine statuses are kept for a moment; a change or Check again asks anew", async () => {
    const net = fakeNetwork();
    t = await createTestApp({ fetch: net.fetchFn });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const asked = () => net.calls.filter((c) => c.url.endsWith("/api/tags")).length;
    await api.engines.get();
    await api.engines.get();
    expect(asked()).toBe(1);
    await api.engines.get({ query: { fresh: "1" } });
    expect(asked()).toBe(2);
    await api.engines.settings.put({ ollamaBaseUrl: "http://127.0.0.1:11434" });
    expect(asked()).toBe(3);
    await api.engines.get();
    expect(asked()).toBe(3);
  });

  test("settings switch the default engine; agents run on it with its model", async () => {
    const net = fakeNetwork();
    t = await createTestApp({ fetch: net.fetchFn });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });

    const bad = await api.engines.settings.put({ ollamaBaseUrl: "ftp://nope" });
    expect(bad.status).toBe(400);
    const res = await api.engines.settings.put({
      default: "ollama",
      models: { ollama: "qwen3:8b" },
    });
    expect(res.data?.default).toBe("ollama");
    expect(JSON.parse(readFileSync(join(t.dataDir, "engines.json"), "utf8")).default).toBe(
      "ollama",
    );
    expect(await git(t.dataDir, ["log", "--oneline", "-1"])).toContain("engine settings");

    await t.chat.post({ chatId: "direct", author: { kind: "user", id: "owner" }, body: "привіт" });
    await Bun.sleep(10);
    await t.runtime.whenIdle();
    const reply = (await t.repo.listMessages("direct", { limit: 5 })).at(-1);
    expect(reply?.body).toBe("Привіт з Ollama");
    expect(reply?.usage?.costUsd).toBe(0);
    const completion = net.calls.find(
      (c) => c.url === "http://127.0.0.1:11434/v1/chat/completions",
    );
    expect(completion?.body).toMatchObject({ model: "qwen3:8b", stream: true });
    const [rows] = await t.db.surreal.query<[{ provider: string }[]]>("SELECT provider FROM run");
    expect(rows?.map((r) => r.provider)).toEqual(["ollama"]);
    expect((await api.provider.get()).data).toMatchObject({ id: "ollama", status: { ok: true } });
  });

  test("an agent can run on its own engine and model", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const res = await api
      .agents({ handle: "orchestrator" })
      .engine.put({ engine: "ollama", model: "qwen3:8b" });
    expect(res.data).toEqual({
      handle: "orchestrator",
      engine: "ollama",
      model: "qwen3:8b",
    });
    const profile = await t.agents.get("orchestrator");
    expect(profile).toMatchObject({ engine: "ollama", model: "qwen3:8b" });
    expect(t.engines.pick(profile ?? { engine: null, model: null })).toMatchObject({
      engine: "ollama",
      model: "qwen3:8b",
    });
    expect(
      (await api.agents({ handle: "nobody" }).engine.put({ engine: null, model: null })).status,
    ).toBe(404);
    expect(
      (
        await api
          .agents({ handle: "orchestrator" })
          .engine.put({ engine: null, model: "bad model id" })
      ).status,
    ).toBe(422);
  });

  test("a Claude model in an engine-less profile is not sent to another engine", async () => {
    t = await createTestApp();
    await t.engines.store.update({ default: "ollama", models: { ollama: "qwen3:8b" } });
    expect(t.engines.pick({ engine: null, model: "claude-sonnet-5-5" })).toMatchObject({
      engine: "ollama",
      model: "qwen3:8b",
    });
    await t.engines.store.update({ default: "claude-code" });
    expect(t.engines.pick({ engine: null, model: "claude-sonnet-5-5" })).toMatchObject({
      engine: "claude-code",
      model: "claude-sonnet-5-5",
    });
  });

  test("hand-edited settings are validated field by field", () => {
    expect(
      parseSettings({
        default: "skynet",
        models: { ollama: "qwen3:8b", "openai-compatible": "bad id!", google: "gone" },
        ollama: { baseUrl: "javascript:x" },
      }),
    ).toMatchObject({
      default: "claude-code",
      models: { ollama: "qwen3:8b" },
      ollama: { baseUrl: "http://127.0.0.1:11434" },
    });
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { treaty } from "@elysiajs/eden";
import { git } from "../../lib/git";
import { createTestApp } from "../../testing";
import { parseSettings } from "./settings";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const KEY = "sk-or-v1-test-secret-key";

/** A fake network: Ollama and OpenRouter endpoints, recording every request. */
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
    if (url.endsWith("/api/v1/models"))
      return Response.json({
        data: [
          {
            id: "big/paid",
            name: "Paid",
            pricing: { prompt: "0.001", completion: "0.002" },
            supported_parameters: ["tools"],
          },
          {
            id: "small/free:free",
            name: "Free",
            pricing: { prompt: "0", completion: "0" },
            supported_parameters: ["tools"],
          },
          { id: "no/tools:free", name: "No tools", pricing: {}, supported_parameters: [] },
        ],
      });
    if (url.endsWith("/api/v1/key")) return Response.json({ data: { is_free_tier: true } });
    if (url.endsWith("/chat/completions")) {
      const text = `data: ${JSON.stringify({ choices: [{ delta: { content: "Привіт з Ollama" } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(text, { headers: { "content-type": "text/event-stream" } });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe("free services (ADR 0037)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  /** A fake Groq and Google: a model list that needs the key. */
  function fakeServices() {
    const calls: { url: string; auth: string | null }[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get("authorization");
      calls.push({ url, auth });
      const known =
        url.startsWith("https://api.groq.com/openai/v1/") ||
        url.startsWith("https://generativelanguage.googleapis.com/v1beta/openai/");
      if (!known) return new Response("not found", { status: 404 });
      if (auth !== "Bearer good-key-123") return new Response("no", { status: 401 });
      if (url.includes("groq"))
        return Response.json({
          data: [{ id: "llama-3.1-8b-instant" }, { id: "openai/gpt-oss-120b" }],
        });
      return Response.json({
        data: [{ id: "models/gemini-2.0-flash" }, { id: "models/gemini-2.5-flash" }],
      });
    }) as unknown as typeof fetch;
    return { calls, fetchFn };
  }

  test("a free service shows up with its key page, and a wrong key is said plainly", async () => {
    const net = fakeServices();
    t = await createTestApp({ fetch: net.fetchFn });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    // Even with nothing else working, a key the service rejects is not made the default.
    (t.provider as unknown as { status: unknown }).status = { ok: false, reason: "no login" };
    await api.engines({ engine: "groq" }).key.put({ key: "wrong-key-1234" });
    const groq = (await api.engines.get()).data?.engines.find((e) => e.id === "groq");
    // A rejected key does not take the place of the default engine.
    expect((await api.engines.get()).data?.default).toBe("claude-code");
    expect(groq).toMatchObject({
      kind: "aura",
      free: true,
      needsKey: true,
      hasKey: true,
      baseUrl: "https://api.groq.com/openai/v1",
      status: { ok: false, reason: "Groq rejected the API key." },
    });
  });

  test("the first key picks the best model and, with nothing else working, becomes the default", async () => {
    const net = fakeServices();
    t = await createTestApp({ fetch: net.fetchFn });
    // Claude Code is not set up on this computer.
    (t.provider as unknown as { status: unknown }).status = { ok: false, reason: "no login" };
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });

    const saved = await api.engines({ engine: "google" }).key.put({ key: "good-key-123" });
    expect(saved.data).toEqual({ hasKey: true, model: "gemini-2.5-flash", isDefault: true });
    const listed = (await api.engines.get()).data;
    expect(listed?.default).toBe("google");
    expect(listed?.engines.find((e) => e.id === "google")).toMatchObject({
      model: "gemini-2.5-flash",
      status: { ok: true },
    });
    // The service's own prefix is not part of a model id, and keys go only to their service.
    const models = (await api.engines({ engine: "google" }).models.get()).data;
    expect(models?.map((m) => m.id)).toEqual(["gemini-2.5-flash", "gemini-2.0-flash"]);
    expect(net.calls.filter((c) => c.auth).every((c) => c.url.includes("googleapis.com"))).toBe(
      true,
    );
  });
});

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
    // Free services lead, your own agent apps come last (ADR 0037).
    expect(before.data?.engines.map((e) => e.id)).toEqual([
      "google",
      "groq",
      "openrouter",
      "cerebras",
      "mistral",
      "ollama",
      "openai-compatible",
      "claude-code",
      "gemini-cli",
      "codex",
      "opencode",
    ]);
    expect(before.data?.engines.find((e) => e.id === "openrouter")?.status.ok).toBe(false);
    expect(before.data?.engines.find((e) => e.id === "ollama")?.status).toEqual({
      ok: true,
      detail: "1 local model",
    });

    expect((await api.engines({ engine: "openrouter" }).key.put({ key: KEY })).data).toMatchObject({
      hasKey: true,
      model: "small/free:free",
      // Claude Code works here, so the first key does not take its place.
      isDefault: false,
    });
    const secrets = join(t.dataDir, "state", "secrets.json");
    expect(statSync(secrets).mode & 0o777).toBe(0o600);
    expect(readFileSync(secrets, "utf8")).toContain(KEY);
    expect(await git(t.dataDir, ["ls-files"])).not.toContain("secrets");

    const after = await api.engines.get();
    expect(JSON.stringify(after.data)).not.toContain(KEY);
    const openrouter = after.data?.engines.find((e) => e.id === "openrouter");
    expect(openrouter).toMatchObject({ hasKey: true, status: { ok: true, detail: "free tier" } });
    expect(net.calls.find((c) => c.url.endsWith("/api/v1/key"))?.auth).toBe(`Bearer ${KEY}`);

    // Keys only go to their own service.
    expect(net.calls.filter((c) => c.url.includes("11434")).every((c) => c.auth === null)).toBe(
      true,
    );

    const models = await api.engines({ engine: "openrouter" }).models.get();
    expect(models.data).toEqual([
      { id: "small/free:free", label: "Free", free: true },
      { id: "big/paid", label: "Paid", free: false },
    ]);
    expect((await api.engines({ engine: "ollama" }).key.put({ key: KEY })).status).toBe(422);
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
      .engine.put({ engine: "openrouter", model: "small/free:free" });
    expect(res.data).toEqual({
      handle: "orchestrator",
      engine: "openrouter",
      model: "small/free:free",
    });
    const profile = await t.agents.get("orchestrator");
    expect(profile).toMatchObject({ engine: "openrouter", model: "small/free:free" });
    expect(t.engines.pick(profile ?? { engine: null, model: null })).toMatchObject({
      engine: "openrouter",
      model: "small/free:free",
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
        models: { ollama: "qwen3:8b", openrouter: "bad id!" },
        ollama: { baseUrl: "javascript:x" },
      }),
    ).toMatchObject({
      default: "claude-code",
      models: { ollama: "qwen3:8b" },
      ollama: { baseUrl: "http://127.0.0.1:11434" },
    });
  });
});

describe("ACP engines in a real run", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("an agent on Gemini CLI (faked) answers in chat and uses app tools through the MCP route", async () => {
    let toolAnswer = "";
    const spawn: Parameters<typeof createTestApp>[0] extends infer O
      ? O extends { acpSpawn?: infer S }
        ? NonNullable<S>
        : never
      : never = () => {
      const toAgent = new TransformStream<Uint8Array, Uint8Array>();
      const toClient = new TransformStream<Uint8Array, Uint8Array>();
      new AgentSideConnection(
        (conn) => ({
          initialize: async () => ({
            protocolVersion: PROTOCOL_VERSION,
            agentCapabilities: { mcpCapabilities: { http: true, sse: false } },
          }),
          newSession: async (params) => {
            const aura = params.mcpServers.find((s) => s.name === "aura");
            mcpUrl = aura && "url" in aura ? aura.url : "";
            return { sessionId: "s1" };
          },
          authenticate: async () => {},
          prompt: async ({ sessionId }) => {
            // The agent calls an app tool over MCP, through the app's own HTTP route.
            const res = await t?.app.handle(
              new Request(mcpUrl, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  accept: "application/json, text/event-stream",
                },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method: "tools/call",
                  params: { name: "list_agents", arguments: {} },
                }),
              }),
            );
            const body = (await res?.json()) as { result?: { content?: { text?: string }[] } };
            toolAnswer = body.result?.content?.[0]?.text ?? JSON.stringify(body);
            await conn.sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "Привіт від Gemini" },
              },
            });
            return { stopReason: "end_turn" };
          },
          cancel: async () => {},
        }),
        ndJsonStream(toClient.writable, toAgent.readable),
      );
      return {
        stdin: toAgent.writable,
        stdout: toClient.readable,
        kill: () => {},
        exited: new Promise<number>(() => {}),
      };
    };
    let mcpUrl = "";
    t = await createTestApp({
      acpAgents: {
        "gemini-cli": {
          id: "gemini-cli",
          label: "Gemini CLI",
          command: () => ({ command: "gemini", args: ["--acp"] }),
          installHint: "",
          loginHint: "",
        },
      },
      acpSpawn: spawn,
    });
    await t.engines.store.update({ default: "gemini-cli" });
    await t.chat.post({
      chatId: "direct",
      author: { kind: "user", id: "owner" },
      body: "хто в команді?",
    });
    await Bun.sleep(10);
    await t.runtime.whenIdle();
    const reply = (await t.repo.listMessages("direct", { limit: 5 })).at(-1);
    expect(reply?.body).toBe("Привіт від Gemini");
    expect(reply?.status).toBe("final");
    expect(toolAnswer).toContain("@orchestrator");
    // The run's tool endpoint is gone after the run.
    const after = await t.app.handle(new Request(mcpUrl, { method: "POST", body: "{}" }));
    expect(after.status).toBe(404);
  });
});

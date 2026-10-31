import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Message, parseServerEvent, type ServerEvent } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { createTestApp, TEST_ORIGIN } from "./testing";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("app", () => {
  let t: TestApp;
  let api: ReturnType<typeof treaty<TestApp["app"]>>;

  beforeAll(async () => {
    t = await createTestApp();
    api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
  });
  afterAll(() => t.close());

  test("GET /health reports ok", async () => {
    const { data, status } = await api.health.get();
    expect(status).toBe(200);
    expect(data?.status).toBe("ok");
    expect(data?.db.ok).toBe(true);
  });

  test("GET /health reports degraded when the db is down", async () => {
    const degraded = await createTestApp({ dbHealth: async () => ({ ok: false, error: "boom" }) });
    const { data } = await treaty(degraded.app).health.get();
    await degraded.close();
    expect(data?.status).toBe("degraded");
    expect(data?.db).toEqual({ ok: false, error: "boom" });
  });

  describe("session", () => {
    test("issues a local session to an allowed origin", async () => {
      const { data, status } = await treaty(t.app).session.local.post(undefined, {
        headers: { origin: TEST_ORIGIN },
      });
      expect(status).toBe(200);
      expect(data?.user.id).toBe("owner");
      expect(t.sessions.verify(data?.token)).not.toBeNull();
    });

    test("refuses other origins and missing origin", async () => {
      const evil = await treaty(t.app).session.local.post(undefined, {
        headers: { origin: "https://evil.example.com" },
      });
      expect(evil.status).toBe(403);
      expect((await treaty(t.app).session.local.post()).status).toBe(403);
    });

    test("refuses non-loopback Host headers", async () => {
      const response = await t.app.handle(
        new Request("http://evil.example.com/health", { headers: { host: "evil.example.com" } }),
      );
      expect(response.status).toBe(403);
    });

    test("protected routes need a token", async () => {
      expect((await treaty(t.app).chats.get()).status).toBe(401);
      const wrong = treaty(t.app, { headers: { authorization: "Bearer nope" } });
      expect((await wrong.chats.get()).status).toBe(401);
    });
  });

  describe("chat", () => {
    test("bootstraps the direct chat", async () => {
      const { data } = await api.chats.get();
      expect(data?.map((c) => c.kind)).toEqual(["direct"]);
    });

    test("posts messages with replies and mentions", async () => {
      const first = await api
        .chats({ chatId: "direct" })
        .messages.post({ body: "hello **world**" });
      expect(first.status).toBe(200);
      const firstId = (first.data as Message).id;

      const reply = await api.chats({ chatId: "direct" }).messages.post({
        body: "ping @orchestrator",
        replyTo: firstId,
      });
      expect((reply.data as Message).replyTo).toBe(firstId);
      expect((reply.data as Message).mentions).toEqual(["orchestrator"]);

      const { data } = await api.chats({ chatId: "direct" }).messages.get({ query: { limit: 10 } });
      const mine = data?.filter((m) => m.author.kind === "user").map((m) => m.body);
      expect(mine).toEqual(["hello **world**", "ping @orchestrator"]);
    });

    test("rejects invalid posts", async () => {
      const missing = await api.chats({ chatId: "nope" }).messages.post({ body: "x" });
      expect(missing.status).toBe(404);
      const blank = await api.chats({ chatId: "direct" }).messages.post({ body: "   " });
      expect(blank.status).toBe(400);
      const { data } = await api.chats({ chatId: "direct" }).messages.get({ query: {} });
      const group = (await api.chats.post({ title: "Other" })).data;
      const other = await api.chats({ chatId: group?.id ?? "" }).messages.post({
        body: "x",
        replyTo: data?.[0]?.id,
      });
      expect(other.status).toBe(400);
    });
  });

  describe("websocket", () => {
    let base = "";

    beforeAll(() => {
      t.app.listen({ hostname: "127.0.0.1", port: 0 });
      base = `ws://127.0.0.1:${t.app.server?.port}/ws`;
    });

    test("rejects connections without a valid token", async () => {
      const ws = new WebSocket(`${base}?token=wrong`);
      const outcome = await new Promise<string>((resolve) => {
        ws.onopen = () => resolve("open");
        ws.onerror = () => resolve("error");
        ws.onclose = () => resolve("closed");
      });
      expect(outcome).not.toBe("open");
    });

    test("hello, ping/pong, and live message.created from another client", async () => {
      const ws = new WebSocket(`${base}?token=${t.token}`);
      const events: ServerEvent[] = [];
      const created = new Promise<Message>((resolve, reject) => {
        ws.onmessage = (raw) => {
          const event = parseServerEvent(String(raw.data));
          if (!event) return;
          events.push(event);
          if (event.type === "hello") ws.send(JSON.stringify({ type: "ping", nonce: "n1" }));
          if (event.type === "pong") {
            void api.chats({ chatId: "direct" }).messages.post({ body: "live!" });
          }
          const sawChat = events.some((e) => e.type === "chat.updated");
          // Earlier tests may still stream orchestrator replies; wait for this test's message.
          const msg = events.find(
            (e) => e.type === "message.created" && e.message.body === "live!",
          );
          if (sawChat && msg?.type === "message.created") resolve(msg.message);
        };
        ws.onerror = () => reject(new Error("websocket error"));
      });
      const message = await created;
      ws.close();
      expect(message.body).toBe("live!");
      expect(events.map((e) => e.type)).toContain("pong");
      expect(events.some((e) => e.type === "chat.updated")).toBe(true);
    });
  });
});

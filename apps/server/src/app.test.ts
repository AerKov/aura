import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { parseServerEvent } from "@crew/shared";
import { treaty } from "@elysiajs/eden";
import { createApp } from "./app";

describe("app", () => {
  const app = createApp({
    dbHealth: async () => ({ ok: true, version: "surrealdb-test" }),
    startedAt: Date.now(),
    corsOrigins: ["http://localhost:1420"],
  });

  test("GET /health reports ok", async () => {
    const { data, status } = await treaty(app).health.get();
    expect(status).toBe(200);
    expect(data?.status).toBe("ok");
    expect(data?.db).toEqual({ ok: true, version: "surrealdb-test" });
  });

  test("GET /health reports degraded when the db is down", async () => {
    const degraded = createApp({
      dbHealth: async () => ({ ok: false, error: "boom" }),
      startedAt: Date.now(),
      corsOrigins: [],
    });
    const { data } = await treaty(degraded).health.get();
    expect(data?.status).toBe("degraded");
    expect(data?.db).toEqual({ ok: false, error: "boom" });
  });

  describe("websocket", () => {
    let url = "";

    beforeAll(() => {
      app.listen({ hostname: "127.0.0.1", port: 0 });
      url = `ws://127.0.0.1:${app.server?.port}/ws`;
    });

    afterAll(async () => {
      await app.stop();
    });

    test("sends hello, then answers ping with pong", async () => {
      const ws = new WebSocket(url);
      const events: unknown[] = [];
      const done = new Promise<void>((resolve, reject) => {
        ws.onmessage = (message) => {
          const event = parseServerEvent(String(message.data));
          events.push(event);
          if (event?.type === "hello") ws.send(JSON.stringify({ type: "ping", nonce: "n1" }));
          if (event?.type === "pong") resolve();
        };
        ws.onerror = () => reject(new Error("websocket error"));
      });
      await done;
      ws.close();
      expect(events).toHaveLength(2);
      expect(events[1]).toMatchObject({ type: "pong", nonce: "n1" });
    });
  });
});

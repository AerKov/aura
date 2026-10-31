import { afterEach, describe, expect, test } from "bun:test";
import type { ServerEvent } from "@aura/shared";
import { FakeProvider } from "../../../providers/fake";
import { createTestApp } from "../../../testing";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("AgentRuntime", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  const owner = { kind: "user" as const, id: "owner" };

  test("orchestrator streams a reply to a direct message and records usage", async () => {
    t = await createTestApp();
    const events: ServerEvent[] = [];
    t.hub.subscribe((e) => events.push(e));

    await t.chat.post({ chatId: "direct", author: owner, body: "hi" });
    await Bun.sleep(10);
    await t.runtime.whenIdle();

    const messages = await t.repo.listMessages("direct", { limit: 10 });
    const reply = messages.at(-1);
    expect(reply?.author).toEqual({ kind: "agent", id: "orchestrator" });
    expect(reply?.body).toBe("Hello there");
    expect(reply?.status).toBe("final");
    expect(reply?.usage).toEqual({ inputTokens: 10, outputTokens: 2, costUsd: 0.001 });
    const deltas = events
      .filter((e) => e.type === "message.delta")
      .map((e) => (e.type === "message.delta" ? e.text : ""));
    expect(deltas.join("")).toBe("Hello there");
    expect(await t.runs.spentByAgent("orchestrator")).toEqual({ usd: 0.001, tokens: 12 });

    const provider = t.provider as FakeProvider;
    expect(provider.calls[0]?.prompt).toContain("<new_message>");
    expect(provider.calls[0]?.builtinTools).toEqual([]);
  });

  test("messages that arrive during a run are answered afterwards, one run at a time", async () => {
    const provider = new FakeProvider(
      (input) => [
        { type: "text-delta", text: /<new_message>[^<]*second/.test(input.prompt) ? "B" : "A" },
        { type: "done" },
      ],
      20,
    );
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: owner, body: "first" });
    await Bun.sleep(5);
    await t.chat.post({ chatId: "direct", author: owner, body: "second" });
    // Wait until both runs finished (the second starts only after the first).
    for (let i = 0; i < 100 && provider.calls.length < 2; i++) await Bun.sleep(10);
    await t.runtime.whenIdle();

    expect(provider.calls).toHaveLength(2);
    const bodies = (await t.repo.listMessages("direct", { limit: 10 })).map((m) => m.body);
    // Each reply comes after its trigger, and the second run starts only after the first ended.
    expect(bodies).toHaveLength(4);
    expect(bodies.indexOf("A")).toBeGreaterThan(bodies.indexOf("first"));
    expect(bodies.indexOf("B")).toBeGreaterThan(bodies.indexOf("second"));
    expect(bodies.indexOf("B")).toBeGreaterThan(bodies.indexOf("A"));
  });

  test("a stopped run keeps the partial text", async () => {
    const provider = new FakeProvider(
      () => [
        { type: "text-delta", text: "partial" },
        { type: "text-delta", text: " more" },
        { type: "done" },
      ],
      100,
    );
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: owner, body: "go" });
    // Time from when the provider has the run (deltas at 100 and 200 ms), not from the post.
    while (provider.calls.length === 0) await Bun.sleep(5);
    await Bun.sleep(150);
    const streaming = (await t.repo.listMessages("direct", { limit: 10 })).at(-1);
    expect(streaming?.status).toBe("streaming");
    expect(t.runtime.stop(streaming?.runId ?? "")).toBe(true);
    await t.runtime.whenIdle();
    const reply = (await t.repo.listMessages("direct", { limit: 10 })).at(-1);
    expect(reply?.body).toBe("partial");
    expect(reply?.status).toBe("final");
    expect(reply?.error).toBe("Stopped");
  });

  test("provider errors end as an error message", async () => {
    const provider = new FakeProvider(() => [
      { type: "error", message: "Claude Code is not logged in.", code: "auth" },
    ]);
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: owner, body: "hi" });
    await Bun.sleep(10);
    await t.runtime.whenIdle();
    const reply = (await t.repo.listMessages("direct", { limit: 10 })).at(-1);
    expect(reply?.status).toBe("error");
    expect(reply?.error).toContain("not logged in");
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import type { Message } from "@aura/shared";
import { FakeProvider, type Script } from "../../../providers/fake";
import { createTestApp } from "../../../testing";
import { ORCHESTRATOR_DEFAULT } from "./defaults";
import { MemoryAgentDirectory } from "./directory";
import type { AgentProfile } from "./profiles";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const worker = (handle: string, extra: Partial<AgentProfile> = {}): AgentProfile => ({
  handle,
  name: handle,
  role: `${handle} role`,
  engine: null,
  model: null,
  systemPrompt: `You are ${handle}.`,
  builtinTools: ["Read", "Write"],
  budgetUsd: null,
  skills: [],
  ...extra,
});

/** Each agent's reply is chosen by its handle (taken from the prompt). */
const byAgent =
  (replies: Record<string, (cwd: string | undefined) => string>, costUsd = 0.001): Script =>
  (input) => {
    const handle = /You are @([a-z0-9_-]+)/.exec(input.prompt)?.[1] ?? "";
    const text = replies[handle]?.(input.cwd) ?? "ok";
    return [
      { type: "text-delta", text },
      { type: "usage", inputTokens: 10, outputTokens: 5, costUsd },
      { type: "done" },
    ];
  };

async function settle(t: TestApp): Promise<void> {
  // Runs can trigger further runs; wait until the system is quiet twice in a row.
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(15);
    if (!t.runtime.isBusy()) {
      await Bun.sleep(15);
      if (!t.runtime.isBusy()) return;
    }
    await t.runtime.whenIdle();
  }
}

async function messagesOf(t: TestApp, chatId: string): Promise<Message[]> {
  return t.repo.listMessages(chatId, { limit: 200 });
}

describe("projects and agent teams", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("agent ping-pong stops at the chain depth limit", async () => {
    const provider = new FakeProvider(
      byAgent({ coder: () => "@reviewer your turn", reviewer: () => "@coder your turn" }),
    );
    const agents = new MemoryAgentDirectory([
      ORCHESTRATOR_DEFAULT,
      worker("coder"),
      worker("reviewer"),
    ]);
    t = await createTestApp({ provider, agents, maxChainDepth: 4 });
    await t.projects.create({
      name: "Loop",
      brief: "@coder go",
      agents: ["coder", "reviewer"],
      budgetUsd: 5,
    });
    await settle(t);

    const project = await t.projects.get("loop");
    const messages = await messagesOf(t, project?.chatId ?? "");
    const agentReplies = messages.filter(
      (m) => m.kind === "text" && m.author.id !== "orchestrator",
    );
    expect(agentReplies.map((m) => m.chainDepth)).toEqual([2, 3, 4]);
    expect(messages.at(-1)?.kind).toBe("system");
    expect(messages.at(-1)?.body).toContain("⛔");
  });

  test("the project budget warns at 80% and stops at 100%", async () => {
    const provider = new FakeProvider(
      byAgent({ coder: () => "@reviewer next", reviewer: () => "@coder next" }, 0.3),
    );
    const agents = new MemoryAgentDirectory([
      ORCHESTRATOR_DEFAULT,
      worker("coder"),
      worker("reviewer"),
    ]);
    t = await createTestApp({ provider, agents });
    await t.projects.create({
      name: "Budget",
      brief: "@coder go",
      agents: ["coder", "reviewer"],
      budgetUsd: 1,
    });
    await settle(t);

    const project = await t.projects.get("budget");
    const messages = await messagesOf(t, project?.chatId ?? "");
    const system = messages.filter((m) => m.kind === "system").map((m) => m.body);
    expect(system.some((b) => b.startsWith("⚠️ 80% of the project budget"))).toBe(true);
    expect(system.at(-1)).toContain("💸");
    // 4 runs of $0.30: the 4th starts below $1 and the 5th is refused.
    expect(provider.calls).toHaveLength(4);
    // Each run is capped by the remaining budget.
    expect(provider.calls[3]?.maxBudgetUsd).toBeCloseTo(0.1);
  });

  test("an agent with its own budget is stopped", async () => {
    const provider = new FakeProvider(byAgent({ coder: () => "done" }, 0.5));
    const agents = new MemoryAgentDirectory([
      ORCHESTRATOR_DEFAULT,
      worker("coder", { budgetUsd: 0.5 }),
    ]);
    t = await createTestApp({ provider, agents });
    const { chat } = await t.projects.create({
      name: "Solo",
      brief: "@coder go",
      agents: ["coder"],
      budgetUsd: 10,
    });
    await settle(t);
    await t.chat.post({
      chatId: chat.id,
      author: { kind: "user", id: "owner" },
      body: "@coder again",
    });
    await settle(t);
    expect(provider.calls).toHaveLength(1);
    expect((await messagesOf(t, chat.id)).at(-1)?.body).toContain("@coder is out of budget");
  });

  test("agents in one project run one at a time, and [no reply] leaves no message", async () => {
    let running = 0;
    let maxParallel = 0;
    const provider = new FakeProvider(async (input) => {
      running++;
      maxParallel = Math.max(maxParallel, running);
      await Bun.sleep(20);
      running--;
      const handle = /You are @([a-z0-9_-]+)/.exec(input.prompt)?.[1];
      return [
        { type: "text-delta", text: handle === "reviewer" ? "[no reply]" : "built it" },
        { type: "done" },
      ];
    });
    const agents = new MemoryAgentDirectory([
      ORCHESTRATOR_DEFAULT,
      worker("coder"),
      worker("reviewer"),
    ]);
    t = await createTestApp({ provider, agents });
    const { chat } = await t.projects.create({
      name: "Lanes",
      brief: "@coder go",
      agents: ["coder", "reviewer"],
      budgetUsd: 5,
    });
    await settle(t);
    await t.chat.post({
      chatId: chat.id,
      author: { kind: "user", id: "owner" },
      body: "@coder and @reviewer, status?",
    });
    await settle(t);

    expect(provider.calls).toHaveLength(3);
    expect(maxParallel).toBe(1);
    const authors = (await messagesOf(t, chat.id))
      .filter((m) => m.kind === "text")
      .map((m) => m.author.id);
    expect(authors).toEqual(["orchestrator", "coder", "owner", "coder"]);
  });

  test("a fan-out over the chain limit posts one notice", async () => {
    const provider = new FakeProvider(byAgent({ coder: () => "@reviewer @orchestrator look" }));
    const agents = new MemoryAgentDirectory([
      ORCHESTRATOR_DEFAULT,
      worker("coder"),
      worker("reviewer"),
    ]);
    t = await createTestApp({ provider, agents, maxChainDepth: 2 });
    const { chat } = await t.projects.create({
      name: "Fan",
      brief: "@coder go",
      agents: ["coder", "reviewer"],
      budgetUsd: 5,
    });
    await settle(t);
    const notices = (await messagesOf(t, chat.id)).filter((m) => m.body.startsWith("⛔"));
    expect(notices).toHaveLength(1);
  });
  test("the user's unaddressed messages are routed: reply, name, or the orchestrator hands over", async () => {
    const provider = new FakeProvider(
      byAgent({
        coder: () => "Started.",
        reviewer: () => "Reviewed.",
        orchestrator: () => "@reviewer please review the latest change.",
      }),
    );
    const agents = new MemoryAgentDirectory([
      ORCHESTRATOR_DEFAULT,
      worker("coder"),
      worker("reviewer"),
    ]);
    t = await createTestApp({ provider, agents });
    const { project } = await t.projects.create({
      name: "Routing",
      brief: "Build it. @coder starts.",
      agents: ["coder", "reviewer"],
      budgetUsd: 1,
      startWith: "coder",
    });
    await settle(t);
    const chatId = project.chatId;
    const owner = { kind: "user" as const, id: "owner" };
    const coderMessage = (await messagesOf(t, chatId)).find((m) => m.author.id === "coder");
    const callsBefore = provider.calls.length;

    // A reply to the coder's message goes to the coder.
    await t.chat.post({
      chatId,
      author: owner,
      body: "also handle negative zero",
      replyTo: coderMessage?.id,
    });
    await settle(t);
    const replyCall = provider.calls[callsBefore];
    expect(replyCall?.prompt).toContain("You are @coder");
    expect(replyCall?.prompt).toContain("replied to your message");

    // A message that starts with an agent's name goes to that agent.
    await t.chat.post({ chatId, author: owner, body: "Reviewer, is it ready?" });
    await settle(t);
    expect(provider.calls.at(-1)?.prompt).toContain("You are @reviewer");

    // Anything else goes to the orchestrator, which hands it over with a mention.
    const before = provider.calls.length;
    await t.chat.post({ chatId, author: owner, body: "can someone double-check the tests?" });
    await settle(t);
    const routed = provider.calls.slice(before);
    expect(routed.map((c) => /You are @([a-z]+)/.exec(c.prompt)?.[1])).toEqual([
      "orchestrator",
      "reviewer",
    ]);
    expect(routed[0]?.prompt).toContain("came to you to route");
  });
});

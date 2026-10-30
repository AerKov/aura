import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Message } from "@aura/shared";
import { git } from "../../../lib/git";
import { FakeProvider, type Script } from "../../../providers/fake";
import { createTestApp } from "../../../testing";
import { ORCHESTRATOR_DEFAULT } from "./defaults";
import { MemoryAgentDirectory } from "./directory";
import type { AgentProfile } from "./profiles";
import { toolsFor } from "./tools";

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

  test("create_project makes a workspace and chat, and the brief wakes the first agent", async () => {
    const provider = new FakeProvider(
      byAgent({
        coder: (cwd) => {
          if (cwd) writeFileSync(join(cwd, "wc.ts"), "console.log(1)");
          return "Wrote wc.ts. @reviewer please check.";
        },
        reviewer: () => "Looks good. @orchestrator done.",
        orchestrator: () => "Summary: the CLI is ready.",
      }),
    );
    const agents = new MemoryAgentDirectory([
      ORCHESTRATOR_DEFAULT,
      worker("coder"),
      worker("reviewer", { builtinTools: ["Read"] }),
    ]);
    t = await createTestApp({ provider, agents });

    const direct = await t.repo.getChat("direct");
    const tools = toolsFor(t.toolDeps, { handle: "orchestrator", chat: direct, depth: 1 });
    const create = tools.find((tool) => tool.name === "create_project");
    const result = await create?.handler({
      name: "Word Counter",
      brief: "Build a word counter CLI. @coder starts, then hands off to @reviewer.",
      agents: ["coder", "reviewer"],
      start_with: "coder",
      budget_usd: 1,
      why: "A CLI",
    });
    expect(result?.isError).toBeFalsy();

    // Nothing happens until the user approves the plan.
    const [pending] = await t.approvals.listPending();
    expect(pending?.kind).toBe("create_project");
    expect(pending?.preview).toContain("**@coder**: coder role");
    expect(await t.projects.get("word-counter")).toBeNull();
    await t.approvals.decide(pending?.id ?? "", true, "owner");
    await settle(t);

    const project = await t.projects.get("word-counter");
    expect(project?.status).toBe("active");
    expect(existsSync(join(project?.workspace ?? "", "BRIEF.md"))).toBe(true);
    const members = await t.repo.members(project?.chatId ?? "");
    expect(members.map((m) => m.participant.id)).toEqual([
      "owner",
      "orchestrator",
      "coder",
      "reviewer",
    ]);

    const messages = await messagesOf(t, project?.chatId ?? "");
    const authors = messages.filter((m) => m.kind === "text").map((m) => m.author.id);
    expect(authors).toEqual(["orchestrator", "coder", "reviewer", "orchestrator"]);
    expect(
      messages.map((m) => m.chainDepth).filter((_, i) => messages[i]?.kind === "text"),
    ).toEqual([1, 2, 3, 4]);

    // The coder ran in the workspace with its tools and team rules; its change was committed.
    const coderCall = provider.calls.find((c) => c.prompt.includes("You are @coder"));
    expect(coderCall?.cwd).toBe(project?.workspace);
    expect(coderCall?.confineToCwd).toBe(true);
    expect(coderCall?.builtinTools).toEqual(["Read", "Write"]);
    expect(coderCall?.systemPrompt).toContain("## Team rules");
    const coderReply = messages.find((m) => m.author.id === "coder");
    expect(coderReply?.card?.type === "run" ? coderReply.card.commit : null).toMatch(
      /^[0-9a-f]{7,}$/,
    );
    expect(await git(project?.workspace ?? "", ["log", "-1", "--format=%an"])).toBe("coder");

    // The orchestrator reviews read-only and has its management tools.
    const orchestratorCall = provider.calls.find((c) => c.prompt.includes("You are @orchestrator"));
    expect(orchestratorCall?.builtinTools).toEqual(["Read", "Glob", "Grep"]);
    expect(orchestratorCall?.tools.map((x) => x.name)).toContain("create_project");

    // Spend is tracked per project.
    expect((await t.projects.get("word-counter"))?.spentUsd).toBeCloseTo(0.003);
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

  test("project and agent creation validate their input before asking", async () => {
    t = await createTestApp();
    const direct = await t.repo.getChat("direct");
    const tools = toolsFor(t.toolDeps, { handle: "orchestrator", chat: direct, depth: 1 });
    const createAgent = tools.find((x) => x.name === "create_agent");
    const createProject = tools.find((x) => x.name === "create_project");

    const bad = await createAgent?.handler({
      handle: "../x",
      name: "X",
      role: "r",
      system_prompt: "p",
      tools: [],
    });
    expect(bad?.isError).toBe(true);
    expect(await t.approvals.listPending()).toHaveLength(0);

    const good = await createAgent?.handler({
      handle: "qa",
      name: "QA",
      role: "Tests",
      system_prompt: "Test",
      tools: ["Read"],
      why: "QA",
    });
    expect(good?.isError).toBeFalsy();
    expect(await t.agents.get("qa")).toBeNull();
    const [pending] = await t.approvals.listPending();
    expect((await t.approvals.decide(pending?.id ?? "", true, "owner")).result).toBe(
      "Created @qa.",
    );
    expect(await t.agents.get("qa")).not.toBeNull();

    const cases = [
      { name: "P", brief: "@qa go", agents: ["ghost"], budget_usd: 1 },
      { name: "P", brief: "no mention", agents: ["qa"], budget_usd: 1 },
      { name: "P", brief: "@qa go", agents: ["qa"], budget_usd: -1 },
      { name: "P", slug: "../etc", brief: "@qa go", agents: ["qa"], budget_usd: 1 },
      {
        name: "P",
        brief: "@qa go",
        agents: ["qa"],
        new_agents: [{ handle: "qa", name: "Q", role: "r", system_prompt: "p", tools: [] }],
        budget_usd: 1,
      },
    ];
    for (const input of cases) expect((await createProject?.handler(input))?.isError).toBe(true);
    expect(await t.approvals.listPending()).toHaveLength(0);
  });

  test("a plan with new agents creates them and the project on approval", async () => {
    t = await createTestApp();
    const direct = await t.repo.getChat("direct");
    const createProject = toolsFor(t.toolDeps, {
      handle: "orchestrator",
      chat: direct,
      depth: 1,
    }).find((x) => x.name === "create_project");
    await createProject?.handler({
      name: "Notes",
      brief: "@writer drafts, then @editor reviews.",
      agents: ["writer", "editor"],
      new_agents: [
        {
          handle: "writer",
          name: "Writer",
          role: "Writes",
          system_prompt: "Write",
          tools: ["Read", "Write"],
        },
        { handle: "editor", name: "Editor", role: "Edits", system_prompt: "Edit", tools: ["Read"] },
      ],
      start_with: "writer",
      budget_usd: 2,
      why: "Notes",
    });
    const [pending] = await t.approvals.listPending();
    expect(pending?.preview).toContain("**@writer** (new)");
    const rejected = await t.approvals.decide(pending?.id ?? "", false, "owner");
    expect(rejected.status).toBe("rejected");
    expect(await t.agents.get("writer")).toBeNull();
    expect(await t.projects.list()).toHaveLength(0);
  });
});

describe("team discipline", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
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

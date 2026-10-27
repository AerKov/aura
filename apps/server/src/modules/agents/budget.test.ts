import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { budgetText, formatTokens } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "./defaults";
import { MemoryAgentDirectory } from "./directory";
import { crossedSpendWarning, spendLevel } from "./guards";
import { type AgentProfile, parseAgentFile, serializeAgentFile } from "./profiles";

setDefaultTimeout(20_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

const worker: AgentProfile = {
  handle: "worker",
  name: "Worker",
  role: "Does things",
  engine: null,
  model: null,
  systemPrompt: "You are worker.",
  builtinTools: [],
  budgetUsd: null,
  skills: [],
};

async function settle(t: TestApp) {
  await Bun.sleep(20);
  await t.runtime.whenIdle();
}

describe("budgets in tokens, optional and editable (ADR 0023)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("a limit in tokens or dollars, whichever comes first; none means no stop", () => {
    const base = { spentUsd: 0, spentTokens: 0, budgetUsd: null, budgetTokens: null };
    expect(spendLevel({ ...base, spentTokens: 9e9 })).toBe("ok");
    expect(spendLevel({ ...base, spentTokens: 800, budgetTokens: 1000 })).toBe("warn");
    expect(spendLevel({ ...base, spentTokens: 1000, budgetTokens: 1000, budgetUsd: 5 })).toBe(
      "stop",
    );
    expect(spendLevel({ ...base, spentUsd: 5, budgetUsd: 5, budgetTokens: 1e9 })).toBe("stop");
    expect(crossedSpendWarning({ ...base, spentTokens: 700, budgetTokens: 1000 }, 0, 200)).toBe(
      true,
    );
    expect(crossedSpendWarning({ ...base, spentTokens: 700 }, 0, 200)).toBe(false);
    expect(formatTokens(1_234)).toBe("1.2K");
    expect(formatTokens(2_000_000)).toBe("2M");
    expect(budgetText({ usd: null, tokens: null })).toBe("no limit");
    expect(budgetText({ usd: 5, tokens: 2_000_000 })).toBe("2M tokens and $5.00");
  });

  test("an agent's token limit survives agent.md", () => {
    const text = serializeAgentFile({ ...worker, budgetTokens: 500_000 });
    expect(text).toContain("budget_tokens: 500000");
    expect(parseAgentFile("worker", text).budgetTokens).toBe(500_000);
    expect(() =>
      parseAgentFile("worker", text.replace("budget_tokens: 500000", "budget_tokens: 12")),
    ).toThrow("token budget");
  });

  test("a project without a budget runs; a token limit stops it; the user changes it", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, worker]),
    });
    const { project, chat } = await t.projects.create({
      name: "Open",
      brief: "@worker start",
      agents: ["worker"],
    });
    expect(project).toMatchObject({ budgetUsd: null, budgetTokens: null });
    await settle(t);
    const intro = await t.repo.listMessages(chat.id, { limit: 5 });
    expect(intro.map((m) => m.body).join("\n")).toContain("budget: no limit");

    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const spent = (await t.projects.get(project.id))?.spentTokens ?? 0;
    expect(spent).toBeGreaterThan(0);
    const limited = await api.projects({ projectId: project.id }).budget.put({
      usd: null,
      tokens: Math.max(1000, spent),
    });
    expect(limited.data).toMatchObject({ budgetTokens: Math.max(1000, spent), budgetUsd: null });
    // Fake runs use few tokens: use the limit up by lowering it to what is spent.
    await t.runs
      .start({
        agent: "worker",
        chatId: chat.id,
        projectId: project.id,
        triggerMessageId: "x",
        provider: "fake",
        model: null,
      })
      .then((id) =>
        t?.runs.finish(id, {
          status: "done",
          tokensIn: 5000,
          tokensOut: 0,
          costUsd: 0,
          toolCalls: [],
          error: null,
        }),
      );
    const before = provider.calls.length;
    await t.chat.post({ chatId: chat.id, author: owner, body: "@worker again" });
    await settle(t);
    expect(provider.calls.length).toBe(before);
    const notes = (await t.repo.listMessages(chat.id, { limit: 20 })).map((m) => m.body).join("\n");
    expect(notes).toContain("The project budget");
    expect(notes).toContain("tokens) is used up");

    // Removing the limit lets the agent run again.
    await api.projects({ projectId: project.id }).budget.put({ usd: null, tokens: null });
    await t.chat.post({ chatId: chat.id, author: owner, body: "@worker go on" });
    await settle(t);
    expect(provider.calls.length).toBe(before + 1);

    expect(
      (await api.projects({ projectId: project.id }).budget.put({ usd: -1, tokens: null })).status,
    ).toBe(400);
  });

  test("an agent's budget is edited on its card", async () => {
    t = await createTestApp({ agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, worker]) });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const res = await api.agents({ handle: "worker" }).settings.put({
      budget: { usd: null, tokens: 2_000_000 },
    });
    expect(res.data?.budget).toMatchObject({ usd: null, tokens: 2_000_000 });
    expect((await t.agents.get("worker"))?.budgetTokens).toBe(2_000_000);
    const cleared = await api.agents({ handle: "worker" }).settings.put({
      budget: { usd: null, tokens: null },
    });
    expect(cleared.data?.budget.tokens).toBeNull();
  });

  test("the orchestrator proposes a budget; it applies on approval", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, worker]),
    });
    const { project } = await t.projects.create({
      name: "Paid",
      brief: "@worker go",
      agents: ["worker"],
      budgetUsd: 5,
    });
    await settle(t);
    await t.chat.post({ chatId: "direct", author: owner, body: "hi" });
    await settle(t);
    const tools = provider.calls.at(-1)?.tools ?? [];
    const propose = tools.find((x) => x.name === "propose_budget");
    const answer = await propose?.handler({
      project: project.id,
      tokens: 3_000_000,
      why: "a subscription: tokens say more than dollars",
    });
    expect(answer?.text).toContain("Approval requested");
    const [pending] = await t.approvals.listPending();
    expect(pending?.title).toContain("3M tokens");
    if (!pending) throw new Error("no approval");
    await t.approvals.decide(pending.id, true, "owner");
    expect(await t.projects.get(project.id)).toMatchObject({
      budgetUsd: null,
      budgetTokens: 3_000_000,
    });
  });
});

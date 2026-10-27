import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { FakeProvider } from "../../providers/fake";
import type { AgentTool } from "../../providers/types";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "../agents/defaults";
import { MemoryAgentDirectory } from "../agents/directory";
import type { AgentProfile } from "../agents/profiles";
import { secretRef } from "../integrations/env";
import { HELP_PAGES } from "./pages";
import { helpTools } from "./tools";

setDefaultTimeout(20_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

const redmine: AgentProfile = {
  handle: "redmine",
  name: "Redmine",
  role: "Tracks issues and time",
  engine: null,
  model: null,
  systemPrompt: "You are redmine.",
  builtinTools: ["Read"],
  budgetUsd: null,
  skills: [],
};

const run = async (tool: AgentTool | undefined, input: Record<string, unknown>) =>
  (await tool?.handler(input))?.text ?? "";

/** Alpha feedback: the orchestrator had to guess how Aura works. */
describe("the orchestrator knows Aura", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("the user guide is embedded and searchable", async () => {
    expect(HELP_PAGES.map((p) => p.id)).toContain("integrations");
    for (const page of HELP_PAGES) expect(page.text.length).toBeGreaterThan(200);
    const [docs] = helpTools();
    expect(await run(docs, {})).toContain("- integrations: MCP servers, secrets");
    const integrations = await run(docs, { topic: "integrations" });
    expect(integrations).toContain("## Secrets");
    // Wiki links become topic hints.
    expect(integrations).toContain('(topic "approvals-and-safety")');
    expect(await run(docs, { search: "allowed hosts" })).toContain("[integrations]");
    expect(await run(docs, { topic: "nope" })).toContain("No topic");
  });

  test("its runs carry the guide and the setup tools", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: owner, body: "how do I add Redmine?" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const call = provider.calls[0];
    expect(call?.systemPrompt).toContain("## About Aura, the app you run in");
    const names = call?.tools.map((x) => x.name) ?? [];
    for (const name of [
      "aura_docs",
      "inspect_setup",
      "test_integration",
      "propose_agent_change",
      "add_agent_to_project",
      "propose_mcp_server",
    ])
      expect(names).toContain(name);
  });

  test("it can change an agent with approval, and add it to a project", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([
        ORCHESTRATOR_DEFAULT,
        redmine,
        { ...redmine, handle: "coder" },
      ]),
    });
    await t.chat.post({ chatId: "direct", author: owner, body: "hi" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const tools = provider.calls[0]?.tools ?? [];
    const change = tools.find((x) => x.name === "propose_agent_change");
    const add = tools.find((x) => x.name === "add_agent_to_project");

    expect(
      await run(change, { agent: "redmine", env: { REDMINE_API_KEY: "plain-key" }, why: "x" }),
    ).toContain("looks like a secret");
    expect(
      await run(change, {
        agent: "redmine",
        tools: ["Read", "Bash"],
        env: { REDMINE_URL: "https://r.example", REDMINE_API_KEY: secretRef("REDMINE_API_KEY") },
        why: "It runs redmine.py",
      }),
    ).toContain("Approval requested");
    const [pending] = await t.approvals.listPending();
    expect(pending?.kind).toBe("agent_change");
    expect(pending?.preview).toContain('+tools: ["Read","Bash"]');
    expect((await t.agents.get("redmine"))?.builtinTools).toEqual(["Read"]);
    await t.approvals.decide(pending?.id ?? "", true, "owner");
    const changed = await t.agents.get("redmine");
    expect(changed?.builtinTools).toEqual(["Read", "Bash"]);
    expect(changed?.env?.REDMINE_API_KEY).toBe(secretRef("REDMINE_API_KEY"));

    const { project, chat } = await t.projects.create({
      name: "Tracker",
      brief: "@coder set it up",
      agents: ["coder"],
      budgetUsd: 5,
    });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    expect(await run(add, { agent: "redmine", project: project.id })).toContain("Added @redmine");
    expect(await run(add, { agent: "redmine", project: project.id })).toContain("already in");
    await t.chat.post({ chatId: chat.id, author: owner, body: "@redmine log 2h" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const bodies = (await t.repo.listMessages(chat.id, { limit: 50 })).map((m) => m.body);
    expect(bodies).toContain("@orchestrator added @redmine to the project.");
    expect(bodies.some((b) => b.includes("is not in this chat"))).toBe(false);
    expect(provider.calls.at(-1)?.prompt).toContain("You are @redmine");
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { FakeProvider } from "../../../providers/fake";
import { createTestApp } from "../../../testing";
import { ORCHESTRATOR_DEFAULT } from "../agents/defaults";
import { MemoryAgentDirectory } from "../agents/directory";
import { toolsFor } from "../agents/tools";
import { SkillError } from "./service";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const skill = (text: string) => `---\ndescription: How to write tests\n---\n${text}\n`;
const coder = {
  handle: "coder",
  name: "Coder",
  role: "Codes",
  engine: null,
  model: null,
  systemPrompt: "Code.",
  builtinTools: [],
  budgetUsd: null,
  skills: [],
};

describe("skills", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("propose, approve with a diff, attach, update and roll back", async () => {
    t = await createTestApp({ agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, coder]) });
    const by = { requestedBy: "orchestrator", chatId: "direct" };

    const first = await t.skills.propose(
      {
        name: "testing",
        content: skill("Write a failing test first."),
        reason: "TDD",
        attachTo: ["coder"],
      },
      by,
    );
    expect(first.title).toBe('New skill "testing"');
    expect(first.preview).toContain("+Write a failing test first.");
    expect(t.skills.read("testing")).toBeNull();
    await t.approvals.decide(first.id, true, "owner");

    expect((await t.agents.get("coder"))?.skills).toEqual(["testing"]);
    const coderProfile = await t.agents.get("coder");
    expect(t.skills.promptFor(coderProfile ?? coder)).toContain("Write a failing test first.");

    const second = await t.skills.propose(
      {
        name: "testing",
        content: skill("Write a failing test first. Keep tests fast."),
        reason: "speed",
        attachTo: [],
      },
      by,
    );
    expect(second.preview).toContain("-Write a failing test first.");
    expect(second.preview).toContain("+Write a failing test first. Keep tests fast.");
    await t.approvals.decide(second.id, true, "owner");

    const [listed] = await t.skills.list();
    expect(listed?.agents).toEqual(["coder"]);
    expect(listed?.versions).toHaveLength(2);
    const firstRef = listed?.versions[1]?.ref ?? "";

    const head = await t.skills.rollback("testing", firstRef);
    expect(t.skills.read("testing")).toBe(skill("Write a failing test first."));
    const [after] = await t.skills.list();
    expect(after?.versions).toHaveLength(3);
    expect(after?.activeRef).toBe(head);
  });

  test("attached skills reach the agent's system prompt", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    const request = await t.skills.propose(
      {
        name: "brevity",
        content: skill("Answer in at most three sentences."),
        reason: "short answers",
        attachTo: ["orchestrator"],
      },
      { requestedBy: "orchestrator", chatId: "direct" },
    );
    await t.approvals.decide(request.id, true, "owner");
    await t.chat.post({ chatId: "direct", author: { kind: "user", id: "owner" }, body: "hi" });
    await Bun.sleep(10);
    await t.runtime.whenIdle();
    expect(provider.calls.at(-1)?.systemPrompt).toContain("Answer in at most three sentences.");
  });

  test("rejects invalid proposals and rollbacks", async () => {
    t = await createTestApp();
    const by = { requestedBy: "orchestrator", chatId: "direct" };
    await expect(
      t.skills.propose({ name: "../x", content: skill("x"), reason: "r", attachTo: [] }, by),
    ).rejects.toThrow(SkillError);
    await expect(
      t.skills.propose(
        { name: "ok-name", content: "no frontmatter", reason: "r", attachTo: [] },
        by,
      ),
    ).rejects.toThrow(/frontmatter/);
    await expect(
      t.skills.propose({ name: "ok-name", content: skill("x"), reason: " ", attachTo: [] }, by),
    ).rejects.toThrow(/reason/);
    await expect(
      t.skills.propose(
        { name: "ok-name", content: skill("x"), reason: "r", attachTo: ["ghost"] },
        by,
      ),
    ).rejects.toThrow(/ghost/);
    await expect(t.skills.rollback("ok-name", "deadbeef")).rejects.toThrow(SkillError);
    await expect(t.skills.rollback("ok-name", "HEAD; rm")).rejects.toThrow(/invalid/);
  });

  test("a regular agent can only propose skills for itself", async () => {
    t = await createTestApp({ agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, coder]) });
    const direct = await t.repo.getChat("direct");
    const tool = toolsFor(t.toolDeps, { handle: "coder", chat: direct, depth: 1 }).find(
      (x) => x.name === "propose_skill_change",
    );
    await tool?.handler({
      name: "speed",
      content: skill("Go fast"),
      reason: "r",
      attach_to: ["orchestrator"],
    });
    const [pending] = await t.approvals.listPending();
    expect(pending?.payload.attachTo).toEqual(["coder"]);
  });
});

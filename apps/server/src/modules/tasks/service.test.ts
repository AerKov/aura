import { afterEach, describe, expect, test } from "bun:test";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "../agents/defaults";
import { MemoryAgentDirectory } from "../agents/directory";
import { toolsFor } from "../agents/tools";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const agent = (handle: string) => ({
  handle,
  name: handle,
  role: "r",
  model: null,
  systemPrompt: "p",
  builtinTools: [],
  budgetUsd: null,
  skills: [],
});

describe("tasks", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("assigning a task posts a card that wakes the assignee; updates change the card", async () => {
    const provider = new FakeProvider(() => [
      { type: "text-delta", text: "[no reply]" },
      { type: "done" },
    ]);
    t = await createTestApp({
      provider,
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, agent("coder"), agent("qa")]),
    });
    const { chat } = await t.projects.create({
      name: "Tasks",
      brief: "@coder hi",
      agents: ["coder", "qa"],
      budgetUsd: 5,
    });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const callsBefore = provider.calls.length;

    const tools = toolsFor(t.toolDeps, { handle: "coder", chat, depth: 2 });
    const create = tools.find((x) => x.name === "create_task");
    const result = await create?.handler({
      title: "Write tests",
      description: "cover edge cases",
      assignee: "qa",
    });
    expect(result?.isError).toBeFalsy();
    await Bun.sleep(20);
    await t.runtime.whenIdle();

    expect(provider.calls.length).toBe(callsBefore + 1);
    expect(provider.calls.at(-1)?.prompt).toContain("You are @qa");
    const [task] = await t.tasks.list(chat.projectId ?? "");
    expect(task).toMatchObject({
      title: "Write tests",
      assignee: "qa",
      status: "todo",
      createdBy: "coder",
    });

    const update = tools.find((x) => x.name === "update_task");
    await update?.handler({ id: task?.id, status: "done", note: "all green" });
    const updated = await t.tasks.get(task?.id ?? "");
    expect(updated?.status).toBe("done");
    const card = (await t.repo.getMessage(updated?.messageId ?? ""))?.card;
    expect(card).toMatchObject({ type: "task", status: "done" });
  });

  test("validation", async () => {
    t = await createTestApp({
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, agent("coder")]),
    });
    const { chat } = await t.projects.create({
      name: "Validation",
      brief: "@coder hi",
      agents: ["coder"],
      budgetUsd: 5,
    });
    const tools = toolsFor(t.toolDeps, { handle: "coder", chat, depth: 2 });
    const create = tools.find((x) => x.name === "create_task");
    expect(
      (await create?.handler({ title: "x", description: "", assignee: "ghost" }))?.isError,
    ).toBe(true);
    expect(
      (await create?.handler({ title: "", description: "", assignee: "coder" }))?.isError,
    ).toBe(true);
    const direct = await t.repo.getChat("direct");
    expect(
      toolsFor(t.toolDeps, { handle: "coder", chat: direct, depth: 1 }).some(
        (x) => x.name === "create_task",
      ),
    ).toBe(false);
    const update = tools.find((x) => x.name === "update_task");
    expect((await update?.handler({ id: "missing", status: "done" }))?.isError).toBe(true);
  });
});

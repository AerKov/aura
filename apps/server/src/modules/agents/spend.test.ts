import { afterEach, expect, test } from "bun:test";
import { createTestApp } from "../../testing";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let t: TestApp | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

test("what every project spent comes from one query and matches the per-project sum", async () => {
  t = await createTestApp();
  const finish = async (projectId: string | null, tokens: number, cost: number) => {
    const id = await t?.runs.start({
      agent: "builder",
      chatId: "direct",
      projectId,
      triggerMessageId: null,
      provider: "fake",
      model: null,
    });
    await t?.runs.finish(id ?? "", {
      status: "done",
      tokensIn: tokens,
      tokensOut: 1,
      costUsd: cost,
      toolCalls: [],
      error: null,
    });
  };
  await finish("alpha", 10, 0.5);
  await finish("alpha", 20, 0.25);
  await finish("beta", 5, 0);
  await finish(null, 100, 1);
  const all = await t.runs.spentByProjects();
  expect(all.get("alpha")).toEqual({ usd: 0.75, tokens: 32 });
  expect(all.get("beta")).toEqual({ usd: 0, tokens: 6 });
  expect(all.size).toBe(2);
  expect(await t.runs.spentByProject("alpha")).toEqual(all.get("alpha") ?? { usd: -1, tokens: -1 });
});

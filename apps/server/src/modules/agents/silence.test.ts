import { afterEach, describe, expect, test } from "bun:test";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { ORCHESTRATOR_DEFAULT } from "./defaults";
import { MemoryAgentDirectory } from "./directory";
import type { AgentProfile } from "./profiles";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

const redmine: AgentProfile = {
  handle: "redmine",
  name: "Redmine",
  role: "Tracks issues and time",
  engine: null,
  model: null,
  systemPrompt: "You are redmine.",
  builtinTools: ["Bash"],
  budgetUsd: null,
  skills: [],
};

async function settle(t: TestApp): Promise<void> {
  await Bun.sleep(20);
  await t.runtime.whenIdle();
}

/** Alpha feedback A4, A8, B15: an agent never stays silent without a reason in the chat. */
describe("no silent agents", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("mentioning an agent outside the chat explains where it is", async () => {
    t = await createTestApp({
      agents: new MemoryAgentDirectory([ORCHESTRATOR_DEFAULT, redmine]),
    });
    await t.chat.post({ chatId: "direct", author: owner, body: "@redmine log 2h on #42" });
    await settle(t);
    let bodies = (await t.repo.listMessages("direct", { limit: 20 })).map((m) => m.body);
    expect(bodies).toContain(
      "@redmine is not in this chat, so it did not get your message. It is not in any chat yet: ask the orchestrator to start a project with it.",
    );
    // The orchestrator still answers the message.
    expect(bodies.at(-1)).toBe("Hello there");

    const { chat } = await t.projects.create({
      name: "Tracker",
      brief: "@redmine keep the sprint tidy",
      agents: ["redmine"],
      budgetUsd: 5,
    });
    await settle(t);
    await t.chat.post({ chatId: "direct", author: owner, body: "@redmine and @nobody, hi" });
    await settle(t);
    bodies = (await t.repo.listMessages("direct", { limit: 20 })).map((m) => m.body);
    expect(bodies).toContain(
      `@redmine is not in this chat, so it did not get your message. Write to it in "Tracker", or ask the orchestrator to add it to this project.`,
    );
    expect(bodies).toContain("There is no agent @nobody. Agents: @orchestrator, @redmine.");
    // Members are addressed as before, with no notice.
    const before = (await t.repo.listMessages(chat.id, { limit: 50 })).length;
    await t.chat.post({ chatId: chat.id, author: owner, body: "@redmine status?" });
    await settle(t);
    const after = await t.repo.listMessages(chat.id, { limit: 50 });
    expect(after.length).toBe(before + 2);
    expect(after.some((m) => m.body.includes("is not in this chat"))).toBe(false);
  });

  test("an empty answer from the model is shown as an error that says so", async () => {
    const provider = new FakeProvider(() => [{ type: "done" }]);
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: owner, body: "hi" });
    await settle(t);
    const reply = (await t.repo.listMessages("direct", { limit: 5 })).at(-1);
    expect(reply?.author.id).toBe("orchestrator");
    expect(reply?.status).toBe("error");
    expect(reply?.error).toContain("The model returned an empty answer (fake");
  });
});

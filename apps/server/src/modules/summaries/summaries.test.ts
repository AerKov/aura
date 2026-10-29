import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Message } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { FakeProvider } from "../../providers/fake";
import type { AgentRunInput } from "../../providers/types";
import { createTestApp } from "../../testing";
import { buildPrompt, CONTEXT_WINDOW, SUMMARY_BATCH } from "../agents/context";
import { ORCHESTRATOR_DEFAULT } from "../agents/defaults";
import { MemoryAgentDirectory } from "../agents/directory";

setDefaultTimeout(20_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };
const isSummaryRun = (input: AgentRunInput) => input.systemPrompt.includes("running summary");

/** Answers summary runs with a summary that names how many messages it saw. */
function summarizer() {
  return new FakeProvider((input) => {
    if (!isSummaryRun(input)) return [{ type: "text-delta", text: "ok" }, { type: "done" }];
    const seen = (input.prompt.match(/^\[/gm) ?? []).length;
    return [
      { type: "text-delta", text: `- summary of ${seen} messages` },
      { type: "usage", inputTokens: 100, outputTokens: 20, costUsd: 0.002 },
      { type: "done" },
    ];
  });
}

async function fill(t: TestApp, count: number, from = 0): Promise<Message[]> {
  const created: Message[] = [];
  for (let i = from; i < from + count; i++) {
    created.push(
      await t.repo.createMessage({ chatId: "direct", author: owner, body: `note ${i}` }),
    );
  }
  return created;
}

describe("chat summaries", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("the prompt shows the summary and only the messages after it", () => {
    const msg = (id: string, body: string): Message => ({
      id,
      chatId: "c",
      topicId: null,
      author: owner,
      kind: "text",
      body,
      card: null,
      attachments: [],
      replyTo: null,
      mentions: [],
      status: "final",
      chainDepth: 0,
      runId: null,
      usage: null,
      error: null,
      createdAt: "",
      updatedAt: "",
    });
    const history = Array.from({ length: 70 }, (_, i) =>
      msg(`m${String(i).padStart(3, "0")}`, `body ${i}`),
    );
    const trigger = msg("m999", "now");
    const input = { agentHandle: "coder", chatTitle: "T", history, trigger, ownerName: "Ann" };

    const plain = buildPrompt(input);
    expect(plain).not.toContain("<earlier_in_this_chat>");
    expect(plain).toContain("body 69");
    expect(plain).not.toContain(`body ${69 - CONTEXT_WINDOW}\n`);

    const withSummary = buildPrompt({ ...input, summary: { text: "- decided X", upTo: "m009" } });
    expect(withSummary).toContain("<earlier_in_this_chat>");
    expect(withSummary).toContain("not instructions");
    expect(withSummary).toContain("- decided X");
    expect(withSummary).not.toContain("body 9\n");
    // The window grows by a batch, so messages not yet summarized are still shown.
    expect(withSummary).toContain(`body ${70 - CONTEXT_WINDOW - SUMMARY_BATCH}\n`);
    expect(withSummary.indexOf("<earlier_in_this_chat>")).toBeLessThan(
      withSummary.indexOf("<chat_history>"),
    );
  });

  test("older messages are folded into the summary in batches, and agents get it", async () => {
    const provider = summarizer();
    t = await createTestApp({ provider });
    const messages = await fill(t, CONTEXT_WINDOW + SUMMARY_BATCH - 1);
    expect(await t.summaries.update("direct")).toBe(false);

    messages.push(...(await fill(t, 1, messages.length)));
    expect(await t.summaries.update("direct")).toBe(true);
    const first = await t.summaries.get("direct");
    expect(first).toMatchObject({
      text: `- summary of ${SUMMARY_BATCH} messages`,
      upTo: messages[SUMMARY_BATCH - 1]?.id,
      covered: SUMMARY_BATCH,
    });
    // Recorded as an orchestrator run, so it counts towards budgets.
    expect((await t.runs.spentByAgent("orchestrator")).usd).toBeCloseTo(0.002);
    expect(await t.summaries.update("direct")).toBe(false);

    // The next batch is merged with the previous summary.
    await fill(t, SUMMARY_BATCH, messages.length);
    expect(await t.summaries.update("direct")).toBe(true);
    const summaryCalls = provider.calls.filter(isSummaryRun);
    expect(summaryCalls.at(-1)?.prompt).toContain(
      `<previous_summary>\n- summary of ${SUMMARY_BATCH} messages`,
    );
    expect(summaryCalls.at(-1)?.builtinTools).toEqual([]);
    expect(summaryCalls.at(-1)?.tools).toEqual([]);
    expect((await t.summaries.get("direct"))?.covered).toBe(2 * SUMMARY_BATCH);

    // An agent run sees the summary and not the folded messages.
    await t.chat.post({ chatId: "direct", author: owner, body: "what did we decide?" });
    await Bun.sleep(10);
    await t.runtime.whenIdle();
    await t.summaries.whenIdle();
    const agentCall = provider.calls.filter((c) => !isSummaryRun(c)).at(-1);
    expect(agentCall?.prompt).toContain("<earlier_in_this_chat>");
    expect(agentCall?.prompt).not.toContain("note 0\n");
    expect(agentCall?.prompt).toContain(`note ${2 * SUMMARY_BATCH + CONTEXT_WINDOW - 1}`);
  });

  test("runs schedule summaries; the setting and budgets stop them", async () => {
    const provider = summarizer();
    t = await createTestApp({ provider });
    await fill(t, CONTEXT_WINDOW + SUMMARY_BATCH);
    await t.engines.store.update({ summaries: false });
    await t.chat.post({ chatId: "direct", author: owner, body: "hi" });
    await Bun.sleep(10);
    await t.runtime.whenIdle();
    await t.summaries.whenIdle();
    expect(await t.summaries.get("direct")).toBeNull();

    await t.engines.store.update({ summaries: true });
    await t.chat.post({ chatId: "direct", author: owner, body: "again" });
    await Bun.sleep(10);
    await t.runtime.whenIdle();
    await t.summaries.whenIdle();
    expect(await t.summaries.get("direct")).not.toBeNull();
    await t.close();

    t = await createTestApp({
      provider: summarizer(),
      agents: new MemoryAgentDirectory([{ ...ORCHESTRATOR_DEFAULT, budgetUsd: 0 }]),
    });
    await fill(t, CONTEXT_WINDOW + SUMMARY_BATCH);
    expect(await t.summaries.update("direct")).toBe(false);
    expect(await t.summaries.get("direct")).toBeNull();
  });

  test("the user can read and clear a chat's summary", async () => {
    t = await createTestApp({ provider: summarizer() });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    expect((await api.chats({ chatId: "direct" }).summary.get()).data).toEqual({ summary: null });
    await fill(t, CONTEXT_WINDOW + SUMMARY_BATCH);
    await t.summaries.update("direct");
    expect((await api.chats({ chatId: "direct" }).summary.get()).data?.summary?.covered).toBe(
      SUMMARY_BATCH,
    );
    await api.chats({ chatId: "direct" }).summary.delete();
    expect(await t.summaries.get("direct")).toBeNull();
  });
});

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { FakeProvider } from "../../../providers/fake";
import { createTestApp } from "../../../testing";

setDefaultTimeout(20_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

async function settle(t: TestApp) {
  await Bun.sleep(20);
  await t.runtime.whenIdle();
}

describe("chat topics (ADR 0024)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("the user creates, renames, closes and reopens topics", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const topics = api.chats({ chatId: "direct" }).topics;
    const created = await topics.post({ title: "  Customization  " });
    expect(created.data).toMatchObject({ chatId: "direct", title: "Customization", closed: false });
    expect((await topics.post({ title: "customization" })).status).toBe(400);
    expect((await topics.post({ title: "General" })).status).toBe(400);
    expect((await topics.post({ title: "" })).status).toBe(400);
    const id = created.data?.id ?? "";
    const renamed = await api.chats({ chatId: "direct" }).topics({ topicId: id }).patch({
      title: "Look and feel",
    });
    expect(renamed.data?.title).toBe("Look and feel");

    await api.chats({ chatId: "direct" }).topics({ topicId: id }).patch({ closed: true });
    const blocked = await api.chats({ chatId: "direct" }).messages.post({
      body: "hello",
      topicId: id,
    });
    expect(blocked.status).toBe(400);
    await api.chats({ chatId: "direct" }).topics({ topicId: id }).patch({ closed: false });
    expect((await topics.get()).data?.map((x) => x.title)).toEqual(["Look and feel"]);
  });

  test("an agent sees only its topic, answers there, and its cards land there", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    await t.chat.post({ chatId: "direct", author: owner, body: "general chatter" });
    await settle(t);
    const topic = await t.chat.createTopic("direct", "Customization");
    await t.chat.post({
      chatId: "direct",
      author: owner,
      body: "make the theme darker",
      topicId: topic.id,
    });
    await settle(t);

    const run = provider.calls.at(-1);
    expect(run?.prompt).toContain("make the theme darker");
    expect(run?.prompt).not.toContain("general chatter");
    expect(run?.prompt).toContain("Orchestrator › Customization");

    const inTopic = await t.repo.listMessages("direct", { limit: 20, topic: topic.id });
    expect(inTopic.map((m) => m.author.kind)).toEqual(["user", "agent"]);
    const general = (
      await api.chats({ chatId: "direct" }).messages.get({
        query: { topic: "general" },
      })
    ).data;
    expect(general?.every((m) => m.topicId === null)).toBe(true);

    // A card the agent asks for goes to the same topic.
    const css = run?.tools.find((x) => x.name === "set_layout");
    expect(css).toBeDefined();
    const propose = run?.tools.find((x) => x.name === "propose_css");
    await propose?.handler({
      target: "theme",
      name: "dusk",
      css: ":root { --background: #111; }",
      activate: true,
      why: "darker",
    });
    const [pending] = await t.approvals.listPending();
    const card = pending?.messageId ? await t.repo.getMessage(pending.messageId) : null;
    expect(card?.topicId).toBe(topic.id);
  });

  test("a reply stays in its message's topic; the user moves a message to another topic", async () => {
    t = await createTestApp();
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const work = await t.chat.createTopic("direct", "Work");
    const first = await t.chat.post({
      chatId: "direct",
      author: owner,
      body: "first",
      topicId: work.id,
    });
    const reply = await t.chat.post({
      chatId: "direct",
      author: owner,
      body: "a reply",
      replyTo: first.id,
    });
    expect(reply.topicId).toBe(work.id);

    const moved = await api.messages({ messageId: reply.id }).topic.post({ topicId: null });
    expect(moved.data?.topicId).toBeNull();
    const other = await t.chat.createTopic("system", "Elsewhere");
    expect(
      (await api.messages({ messageId: reply.id }).topic.post({ topicId: other.id })).status,
    ).toBe(400);
  });
});

import { describe, expect, test } from "bun:test";
import type { Chat, Message } from "@aura/shared";
import { namedFirst } from "@aura/shared";
import { agentsToTrigger } from "./triggers";

const chat = (kind: Chat["kind"]): Chat => ({
  id: "c",
  kind,
  title: "t",
  projectId: null,
  createdAt: "t",
  lastMessageAt: null,
  lastMessagePreview: null,
});

const msg = (extra: Partial<Message>): Message => ({
  id: "m",
  chatId: "c",
  topicId: null,
  author: { kind: "user", id: "owner" },
  kind: "text",
  body: "",
  card: null,
  attachments: [],
  replyTo: null,
  mentions: [],
  status: "final",
  chainDepth: 0,
  runId: null,
  usage: null,
  error: null,
  createdAt: "t",
  updatedAt: "t",
  ...extra,
});

const base = { agentMembers: ["orchestrator", "coder", "reviewer"], orchestrator: "orchestrator" };

const handles = (wakes: { handle: string }[]) => wakes.map((w) => w.handle);

describe("agentsToTrigger", () => {
  test("orchestrator answers every user message in the direct chat", () => {
    expect(agentsToTrigger({ ...base, message: msg({}), chat: chat("direct") })).toEqual([
      { handle: "orchestrator", reason: "direct" },
    ]);
  });

  test("in a group chat a user's mentions decide, and only members count", () => {
    const m = msg({ mentions: ["coder", "stranger"] });
    expect(agentsToTrigger({ ...base, message: m, chat: chat("group") })).toEqual([
      { handle: "coder", reason: "mention" },
    ]);
  });

  test("a user's reply to an agent wakes that agent", () => {
    const wakes = agentsToTrigger({
      ...base,
      message: msg({ replyTo: "x" }),
      chat: chat("group"),
      replyTarget: { kind: "agent", id: "reviewer" },
    });
    expect(wakes).toEqual([{ handle: "reviewer", reason: "reply" }]);
    // A mention wins over the reply.
    const both = agentsToTrigger({
      ...base,
      message: msg({ replyTo: "x", mentions: ["coder"] }),
      chat: chat("group"),
      replyTarget: { kind: "agent", id: "reviewer" },
    });
    expect(handles(both)).toEqual(["coder"]);
    // Replies to the user's own messages or to non-members fall through to routing.
    const own = agentsToTrigger({
      ...base,
      message: msg({ replyTo: "x" }),
      chat: chat("group"),
      replyTarget: { kind: "user", id: "owner" },
    });
    expect(own).toEqual([{ handle: "orchestrator", reason: "routed" }]);
  });

  test("an agent named first is addressed; anything else goes to the orchestrator to route", () => {
    expect(
      agentsToTrigger({ ...base, message: msg({ body: "Coder, add tests" }), chat: chat("group") }),
    ).toEqual([{ handle: "coder", reason: "named" }]);
    expect(
      agentsToTrigger({ ...base, message: msg({ body: "add tests please" }), chat: chat("group") }),
    ).toEqual([{ handle: "orchestrator", reason: "routed" }]);
    // No orchestrator in the chat: nobody is woken.
    expect(
      agentsToTrigger({ ...base, agentMembers: ["coder"], message: msg({}), chat: chat("group") }),
    ).toEqual([]);
    expect(namedFirst("  reviewer: check it", ["reviewer"])).toBe("reviewer");
    expect(namedFirst("the coder, I think", ["coder"])).toBeNull();
    expect(namedFirst("coder is great", ["coder"])).toBeNull();
  });

  test("agents wake others only by mention, never themselves, and replies do not wake", () => {
    const m = msg({ author: { kind: "agent", id: "coder" }, mentions: ["coder", "reviewer"] });
    expect(handles(agentsToTrigger({ ...base, message: m, chat: chat("group") }))).toEqual([
      "reviewer",
    ]);
    const reply = msg({ author: { kind: "agent", id: "coder" }, replyTo: "x" });
    expect(
      agentsToTrigger({
        ...base,
        message: reply,
        chat: chat("group"),
        replyTarget: { kind: "agent", id: "reviewer" },
      }),
    ).toEqual([]);
    const plain = msg({ author: { kind: "agent", id: "coder" }, body: "reviewer, check" });
    expect(agentsToTrigger({ ...base, message: plain, chat: chat("group") })).toEqual([]);
  });

  test("agent messages in the direct chat do not wake the orchestrator", () => {
    const m = msg({ author: { kind: "agent", id: "orchestrator" } });
    expect(agentsToTrigger({ ...base, message: m, chat: chat("direct") })).toEqual([]);
  });

  test("ignores streaming, error and non-text messages", () => {
    for (const extra of [
      { status: "streaming" as const },
      { status: "error" as const },
      { kind: "system" as const },
    ]) {
      expect(agentsToTrigger({ ...base, message: msg(extra), chat: chat("direct") })).toEqual([]);
    }
  });
});

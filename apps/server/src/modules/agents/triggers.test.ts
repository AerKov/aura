import { describe, expect, test } from "bun:test";
import type { Chat, Message } from "@aura/shared";
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
  author: { kind: "user", id: "owner" },
  kind: "text",
  body: "",
  card: null,
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

describe("agentsToTrigger", () => {
  test("orchestrator answers every user message in the direct chat", () => {
    expect(agentsToTrigger({ ...base, message: msg({}), chat: chat("direct") })).toEqual([
      "orchestrator",
    ]);
  });

  test("group chats need a mention, and only members count", () => {
    expect(agentsToTrigger({ ...base, message: msg({}), chat: chat("group") })).toEqual([]);
    const m = msg({ mentions: ["coder", "stranger"] });
    expect(agentsToTrigger({ ...base, message: m, chat: chat("group") })).toEqual(["coder"]);
  });

  test("agents do not trigger themselves", () => {
    const m = msg({ author: { kind: "agent", id: "coder" }, mentions: ["coder", "reviewer"] });
    expect(agentsToTrigger({ ...base, message: m, chat: chat("group") })).toEqual(["reviewer"]);
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

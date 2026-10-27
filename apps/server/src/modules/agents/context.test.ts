import { expect, test } from "bun:test";
import type { Message } from "@aura/shared";
import { buildPrompt, CONTEXT_WINDOW, userNote } from "./context";

const msg = (id: string, body: string, extra: Partial<Message> = {}): Message => ({
  id,
  chatId: "c",
  author: { kind: "user", id: "owner" },
  kind: "text",
  body,
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

test("buildPrompt puts history first and the trigger last", () => {
  const a = msg("a", "hello");
  const b = msg("b", "hi there", { author: { kind: "agent", id: "orchestrator" } });
  const c = msg("c", "plan it", { replyTo: "b" });
  const prompt = buildPrompt({
    agentHandle: "orchestrator",
    chatTitle: "Orchestrator",
    history: [a, b, c],
    trigger: c,
    ownerName: "Ann",
  });
  expect(prompt).toContain("[Ann (user)]\nhello");
  expect(prompt).toContain("[@orchestrator]\nhi there");
  expect(prompt).toContain(
    "<new_message>\n[Ann (user) (replying to @orchestrator)]\nplan it\n</new_message>",
  );
  expect(prompt.indexOf("<chat_history>")).toBeLessThan(prompt.indexOf("<new_message>"));
});

test("buildPrompt skips streaming messages and limits the window", () => {
  const history = Array.from({ length: CONTEXT_WINDOW + 10 }, (_, i) => msg(`m${i}`, `n${i}`));
  history.push(msg("s", "partial", { status: "streaming" }));
  const trigger = msg("t", "go");
  const prompt = buildPrompt({
    agentHandle: "x",
    chatTitle: "c",
    history,
    trigger,
    ownerName: "Ann",
  });
  expect(prompt).not.toContain("partial");
  expect(prompt).not.toContain("\nn0\n");
  expect(prompt).toContain(`n${CONTEXT_WINDOW + 9}`);
});

test("userNote names the user's language", () => {
  expect(userNote("Ann", null)).toBe("");
  expect(userNote("Ann", "Ukrainian")).toContain("must be in Ukrainian");
  expect(userNote("Ann", "Ukrainian")).toContain("Never answer the user in Russian");
  expect(userNote("Ann", "English")).not.toContain("Russian");
});

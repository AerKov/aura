import { describe, expect, test } from "bun:test";
import type { Message } from "@aura/shared";
import { mergeMessages } from "./store";

const msg = (id: string, body = id): Message => ({
  id,
  chatId: "c",
  topicId: null,
  author: { kind: "user", id: "owner" },
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
  createdAt: "t",
  updatedAt: "t",
});

describe("mergeMessages", () => {
  test("sorts by id and replaces duplicates", () => {
    const merged = mergeMessages([msg("b"), msg("d")], [msg("a"), msg("c"), msg("b", "B2")]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
    expect(merged[1]?.body).toBe("B2");
  });

  test("handles empty input", () => {
    expect(mergeMessages(undefined, [])).toEqual([]);
  });
});

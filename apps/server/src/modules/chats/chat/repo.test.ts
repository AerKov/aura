import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { connectDb, type Db } from "../../../db/client";
import { ChatRepo, ORCHESTRATOR } from "./repo";

describe("ChatRepo", () => {
  let db: Db;
  let repo: ChatRepo;

  beforeAll(async () => {
    db = await connectDb("mem://");
    repo = new ChatRepo(db.surreal);
  });
  afterAll(() => db.close());

  test("creates chats with members idempotently", async () => {
    await repo.ensureOwner();
    const members = [
      { participant: { kind: "user" as const, id: "owner" }, role: "owner" as const },
      { participant: ORCHESTRATOR, role: "member" as const },
    ];
    await repo.createChat({ id: "c1", kind: "direct", title: "Orchestrator", members });
    await repo.createChat({ id: "c1", kind: "direct", title: "Orchestrator", members });
    expect(await repo.members("c1")).toHaveLength(2);
    expect(await repo.isMember("c1", ORCHESTRATOR)).toBe(true);
    expect(await repo.isMember("c1", { kind: "agent", id: "coder" })).toBe(false);
  });

  test("creates, pages and updates messages", async () => {
    const author = { kind: "user" as const, id: "owner" };
    const first = await repo.createMessage({ chatId: "c1", author, body: "**one**" });
    const second = await repo.createMessage({
      chatId: "c1",
      author,
      body: "two",
      replyTo: first.id,
      mentions: ["orchestrator"],
    });
    expect(second.replyTo).toBe(first.id);
    expect(second.mentions).toEqual(["orchestrator"]);

    const all = await repo.listMessages("c1", { limit: 10 });
    expect(all.map((m) => m.body)).toEqual(["**one**", "two"]);
    const before = await repo.listMessages("c1", { limit: 10, before: second.id });
    expect(before.map((m) => m.id)).toEqual([first.id]);

    const updated = await repo.updateMessage(first.id, { body: "edited", status: "final" });
    expect(updated.body).toBe("edited");

    const chat = await repo.getChat("c1");
    expect(chat.lastMessagePreview).toBe("edited");
    expect((await repo.listChats())[0]?.id).toBe("c1");
  });

  test("missing records", async () => {
    expect(await repo.findChat("nope")).toBeNull();
    expect(await repo.getMessage("nope")).toBeNull();
  });
});

test("concurrent messages in one chat do not fail on write conflicts", async () => {
  const { connectDb } = await import("../../../db/client");
  const { ChatRepo } = await import("./repo");
  const db = await connectDb("mem://");
  try {
    const repo = new ChatRepo(db.surreal);
    await repo.createChat({ id: "busy", kind: "group", title: "Busy", members: [] });
    const author = { kind: "user" as const, id: "owner" };
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        repo.createMessage({ chatId: "busy", author, body: `m${i}` }),
      ),
    );
    expect(await repo.listMessages("busy", { limit: 50 })).toHaveLength(20);
  } finally {
    await db.close();
  }
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { connectDb, type Db } from "../../../db/client";
import { ChatRepo } from "../../chats/chat/repo";
import { ChatService } from "../../chats/chat/service";
import { ApprovalError, ApprovalService } from "./service";

describe("ApprovalService", () => {
  let db: Db;
  let repo: ChatRepo;
  let approvals: ApprovalService;
  const executed: Record<string, unknown>[] = [];

  beforeAll(async () => {
    db = await connectDb("mem://");
    repo = new ChatRepo(db.surreal);
    await new ChatService(repo).bootstrap();
    approvals = new ApprovalService(db.surreal, repo);
    approvals.register("create_agent", async (payload) => {
      if (payload.fail) throw new Error("disk full");
      await Bun.sleep(10);
      executed.push(payload);
      return `created @${String(payload.handle)}`;
    });
  });
  afterAll(() => db.close());

  const request = (payload: Record<string, unknown>) =>
    approvals.request({
      kind: "create_agent",
      requestedBy: "orchestrator",
      chatId: "direct",
      title: "Create @qa",
      why: "Need tests",
      preview: "**@qa**",
      payload,
    });

  test("a request posts a pending card and does nothing yet", async () => {
    const before = executed.length;
    const record = await request({ handle: "qa" });
    expect(record.status).toBe("pending");
    expect(executed.length).toBe(before);
    const message = await repo.getMessage(record.messageId ?? "");
    expect(message?.kind).toBe("card");
    expect(message?.card).toMatchObject({
      type: "approval",
      status: "pending",
      approvalId: record.id,
    });
    expect((await approvals.listPending()).map((a) => a.id)).toContain(record.id);
  });

  test("approval runs the effect exactly once, even with concurrent clicks", async () => {
    const record = await request({ handle: "once" });
    const results = await Promise.allSettled([
      approvals.decide(record.id, true, "owner"),
      approvals.decide(record.id, true, "owner"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(executed.filter((p) => p.handle === "once")).toHaveLength(1);
    const decided = await approvals.get(record.id);
    expect(decided?.status).toBe("approved");
    expect(decided?.result).toBe("created @once");
    const card = (await repo.getMessage(record.messageId ?? ""))?.card;
    expect(card).toMatchObject({ status: "approved", result: "created @once" });
    await expect(approvals.decide(record.id, false, "owner")).rejects.toThrow(ApprovalError);
  });

  test("rejection never runs the effect", async () => {
    const record = await request({ handle: "nope" });
    const decided = await approvals.decide(record.id, false, "owner");
    expect(decided.status).toBe("rejected");
    expect(executed.some((p) => p.handle === "nope")).toBe(false);
  });

  test("a failing effect is reported as failed", async () => {
    const record = await request({ handle: "x", fail: true });
    const decided = await approvals.decide(record.id, true, "owner");
    expect(decided.status).toBe("failed");
    expect(decided.result).toBe("disk full");
  });

  test("unknown ids and unregistered kinds are errors", async () => {
    await expect(approvals.decide("missing", true, "owner")).rejects.toThrow("not found");
    await expect(
      approvals.request({
        kind: "skill_change",
        requestedBy: "o",
        chatId: "direct",
        title: "t",
        why: "w",
        preview: "p",
        payload: {},
      }),
    ).rejects.toThrow("no executor");
  });
});

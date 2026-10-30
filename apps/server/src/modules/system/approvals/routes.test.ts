import { afterAll, beforeAll, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { createTestApp } from "../../../testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

test("approvals over HTTP: list pending, decide once, 409 after", async () => {
  const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
  await t.skills.propose(
    {
      name: "style",
      content: "---\ndescription: Style\n---\nBe brief.",
      reason: "consistency",
      attachTo: [],
    },
    { requestedBy: "orchestrator", chatId: "direct" },
  );
  const { data: pending } = await api.approvals.get();
  expect(pending).toHaveLength(1);
  const id = pending?.[0]?.approvalId ?? "";

  const decided = await api.approvals({ approvalId: id }).decide.post({ approve: true });
  expect(decided.data?.status).toBe("approved");
  const again = await api.approvals({ approvalId: id }).decide.post({ approve: false });
  expect(again.status).toBe(409);
  expect((await api.approvals({ approvalId: "nope" }).decide.post({ approve: true })).status).toBe(
    404,
  );

  const { data: skills } = await api.skills.get();
  expect(skills?.map((s) => s.name)).toEqual(["style"]);
  const bad = await api.skills({ name: "style" }).rollback.post({ ref: "0000000" });
  expect(bad.status).toBe(400);
});

test("approvals need a session", async () => {
  expect((await treaty(t.app).approvals.get()).status).toBe(401);
});

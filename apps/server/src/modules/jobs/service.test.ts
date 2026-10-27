import { afterEach, describe, expect, test } from "bun:test";
import { FakeProvider } from "../../providers/fake";
import { createTestApp } from "../../testing";
import { toolsFor } from "../agents/tools";
import { assertReasonableSchedule, JobError, JobService } from "./service";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("jobs", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("schedule validation", () => {
    expect(() => assertReasonableSchedule("not cron")).toThrow(JobError);
    expect(() => assertReasonableSchedule("* * * * *")).toThrow(/10 minutes/);
    expect(() => assertReasonableSchedule("*/5 * * * *")).toThrow(/10 minutes/);
    expect(() => assertReasonableSchedule("0 8 * * *")).not.toThrow();
    expect(() => assertReasonableSchedule("@daily")).not.toThrow();
  });

  test("schedule_job asks for approval; due jobs wake the agent and reschedule", async () => {
    const provider = new FakeProvider(() => [
      { type: "text-delta", text: "Here is today's digest." },
      { type: "done" },
    ]);
    t = await createTestApp({ provider });
    const direct = await t.repo.getChat("direct");
    const tool = toolsFor(t.toolDeps, { handle: "orchestrator", chat: direct, depth: 1 }).find(
      (x) => x.name === "schedule_job",
    );
    const bad = await tool?.handler({
      name: "x",
      schedule: "0 8 * * *",
      chat: "direct",
      agent: "ghost",
      prompt: "p",
      why: "w",
    });
    expect(bad?.isError).toBe(true);
    await tool?.handler({
      name: "Digest",
      schedule: "0 8 * * *",
      chat: "direct",
      agent: "orchestrator",
      prompt: "Summarize my day",
      why: "daily",
    });
    const [pending] = await t.approvals.listPending();
    expect(pending?.kind).toBe("schedule_job");
    expect(await t.jobs.list()).toHaveLength(0);
    await t.approvals.decide(pending?.id ?? "", true, "owner");
    const [job] = await t.jobs.list();
    expect(job).toMatchObject({ name: "Digest", status: "active", agent: "orchestrator" });

    // A scheduler whose clock is a day later finds the job due.
    let now = new Date(Date.now() + 25 * 3_600_000);
    const later = new JobService({ db: t.db.surreal, repo: t.repo, chat: t.chat, now: () => now });
    expect(await later.tick()).toBe(1);
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const messages = await t.repo.listMessages("direct", { limit: 10 });
    expect(
      messages.some((m) => m.author.id === "scheduler" && m.body.includes("Summarize my day")),
    ).toBe(true);
    expect(messages.at(-1)?.body).toBe("Here is today's digest.");
    const [after] = await t.jobs.list();
    expect(new Date(after?.nextRunAt ?? 0).getTime()).toBeGreaterThan(now.getTime());
    expect(await later.tick()).toBe(0);

    // Paused jobs do not run.
    await t.jobs.setStatus(job?.id ?? "", "paused");
    now = new Date(now.getTime() + 3 * 86_400_000);
    expect(await later.tick()).toBe(0);
  });

  test("message_project delegates into a project and wakes the mentioned agent", async () => {
    const provider = new FakeProvider(() => [
      { type: "text-delta", text: "[no reply]" },
      { type: "done" },
    ]);
    t = await createTestApp({ provider });
    await t.agents.create({
      handle: "ops",
      name: "Ops",
      role: "r",
      engine: null,
      model: null,
      systemPrompt: "p",
      builtinTools: [],
      budgetUsd: null,
      skills: [],
    });
    await t.projects.create({ name: "Infra", brief: "@ops hi", agents: ["ops"], budgetUsd: 5 });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const before = provider.calls.length;
    const system = await t.repo.getChat("system");
    const tool = toolsFor(t.toolDeps, { handle: "orchestrator", chat: system, depth: 1 }).find(
      (x) => x.name === "message_project",
    );
    expect(
      (await tool?.handler({ project: "infra", message: "@ops please check the disk alert" }))
        ?.isError,
    ).toBeFalsy();
    expect((await tool?.handler({ project: "direct", message: "x" }))?.isError).toBe(true);
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    expect(provider.calls.length).toBe(before + 1);
    expect(provider.calls.at(-1)?.prompt).toContain("You are @ops");
  });
});

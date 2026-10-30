import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { treaty } from "@elysiajs/eden";
import { createTestApp } from "../../testing";

setDefaultTimeout(60_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("restore points of the whole Aura (ADR 0033)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("going back restores config, apps and settings; the saved present goes forward again", async () => {
    t = await createTestApp({ fileAgents: true });
    const api = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const prompt = join(t.dataDir, "agents", "orchestrator", "agent.md");
    await api.apps.post({ name: "Clients" });
    await t.appData.insert("clients", "clients", { name: "Petrenko" });
    await t.appearance.set({ wm: { gaps: 4 } });
    const original = readFileSync(prompt, "utf8");

    const point = (await api["restore-points"].post({ label: "Before the experiment" })).data;
    expect(point).toMatchObject({ label: "Before the experiment", auto: false, apps: ["clients"] });

    // The experiment: a new app, other data, a changed prompt, and settings.
    await api.apps.post({ name: "Board" });
    await t.appData.insert("clients", "clients", { name: "Kovalenko" });
    writeFileSync(prompt, `${original}\nExperiment.\n`);
    await t.appearance.set({ wm: { gaps: 16 } });

    const back = await api["restore-points"]({ id: point?.id ?? "" }).restore.post();
    expect(back.status).toBe(200);
    expect(readFileSync(prompt, "utf8")).toBe(original);
    expect(t.apps.sources().map((a) => a.id)).toEqual(["clients"]);
    expect((await t.appData.list("clients", "clients")).map((r) => r.name)).toEqual(["Petrenko"]);
    expect((await t.appearance.get()).wm.gaps).toBe(4);
    // The app made since left with a backup, not for good.
    expect((await api["app-backups"].get()).data?.map((b) => b.id)).toEqual(["board"]);

    // Forward again: the automatic point saved before going back.
    const saved = back.data?.saved;
    expect(saved).toMatchObject({ auto: true, apps: ["board", "clients"] });
    await api["restore-points"]({ id: saved?.id ?? "" }).restore.post();
    expect(readFileSync(prompt, "utf8")).toContain("Experiment.");
    expect(
      t.apps
        .sources()
        .map((a) => a.id)
        .sort(),
    ).toEqual(["board", "clients"]);
    expect((await t.appData.list("clients", "clients")).map((r) => r.name).sort()).toEqual([
      "Kovalenko",
      "Petrenko",
    ]);
    expect((await t.appearance.get()).wm.gaps).toBe(16);

    const list = (await api["restore-points"].get()).data ?? [];
    expect(list.length).toBe(3);
    expect((await api["restore-points"]({ id: point?.id ?? "" }).delete()).status).toBe(200);
    expect(existsSync(join(t.dataDir, "restore-points", point?.id ?? ""))).toBe(false);
    expect(
      (await api["restore-points"]({ id: "20260101T000000-zzzz" }).restore.post()).status,
    ).toBe(400);
  });
});

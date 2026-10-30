import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FakeProvider } from "../../../providers/fake";
import { createTestApp } from "../../../testing";

setDefaultTimeout(30_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

async function setup(t: TestApp) {
  await t.agents.create({
    handle: "tester",
    name: "Tester",
    role: "runs checks",
    engine: null,
    model: null,
    systemPrompt: "p",
    builtinTools: ["Read"],
    budgetUsd: null,
    skills: [],
  });
  return t.projects.create({
    name: "Reports",
    brief: "@tester write the reports",
    agents: ["tester"],
    startWith: "tester",
    kickoff: false,
  });
}

describe("files and agents (ADR 0036)", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("a helper is told about a user's file and finds it in its folder, outside git", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    const { project, chat } = await setup(t);
    const ref = t.files.put(
      { kind: "chat", id: chat.id },
      "plan.pdf",
      new TextEncoder().encode("%PDF-1.4"),
    );

    await t.chat.post({
      chatId: chat.id,
      author: { kind: "user", id: "owner" },
      body: "@tester please read this",
      attachments: [ref],
    });
    await Bun.sleep(30);
    await t.runtime.whenIdle();

    const staged = `attachments/${ref.id}__plan.pdf`;
    expect(provider.calls.at(-1)?.prompt).toContain(
      `[Attached file: ${staged} (application/pdf, 8 B)]`,
    );
    const workspace = t.projects.workspaceOf(project.id);
    expect(readFileSync(join(workspace, staged), "utf8")).toBe("%PDF-1.4");
    expect(readFileSync(join(workspace, ".gitignore"), "utf8")).toContain("attachments/");
  });

  test("a helper shares a finished file from its folder; paths outside it are refused", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    const { project, chat } = await setup(t);
    await t.chat.post({
      chatId: chat.id,
      author: { kind: "user", id: "owner" },
      body: "@tester go",
    });
    await Bun.sleep(30);
    await t.runtime.whenIdle();
    const tool = provider.calls.at(-1)?.tools.find((x) => x.name === "attach_file");
    expect(tool).toBeDefined();

    const workspace = t.projects.workspaceOf(project.id);
    mkdirSync(join(workspace, "out"), { recursive: true });
    writeFileSync(join(workspace, "out", "report.pdf"), "%PDF-1.4 report");
    const done = await tool?.handler({ path: "out/report.pdf", note: "Here it is." });
    expect(done?.text).toContain("Shared report.pdf");

    const messages = await t.repo.listMessages(chat.id, { limit: 20 });
    const shared = messages.find((m) => m.attachments.length > 0);
    expect(shared).toMatchObject({ body: "Here it is.", author: { kind: "agent", id: "tester" } });
    const ref = shared?.attachments[0];
    expect(ref).toMatchObject({ name: "report.pdf", type: "application/pdf" });
    expect(existsSync(t.files.find({ kind: "chat", id: chat.id }, ref?.id ?? "")?.path ?? "")).toBe(
      true,
    );

    for (const bad of ["../../etc/passwd", "/etc/passwd", ".git/HEAD", "out", "missing.pdf"]) {
      const refused = await tool?.handler({ path: bad });
      expect(refused?.isError).toBe(true);
    }
  });
});

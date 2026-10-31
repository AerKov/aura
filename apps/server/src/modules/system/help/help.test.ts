import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { FakeProvider } from "../../../providers/fake";
import type { AgentTool } from "../../../providers/types";
import { createTestApp } from "../../../testing";
import { HELP_PAGES } from "./pages";
import { helpTools } from "./tools";

setDefaultTimeout(20_000);

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const owner = { kind: "user" as const, id: "owner" };

const run = async (tool: AgentTool | undefined, input: Record<string, unknown>) =>
  (await tool?.handler(input))?.text ?? "";

/** Alpha feedback: the orchestrator had to guess how Aura works. */
describe("the orchestrator knows Aura", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("the user guide is embedded and searchable", async () => {
    expect(HELP_PAGES.map((p) => p.id)).toContain("apps");
    for (const page of HELP_PAGES) expect(page.text.length).toBeGreaterThan(200);
    const [docs] = helpTools();
    expect(await run(docs, {})).toContain("- apps: Make an app, change it with approval");
    const apps = await run(docs, { topic: "apps" });
    expect(apps).toContain("## Its secrets");
    // Wiki links become topic hints.
    expect(apps).toContain('(topic "the-screen")');
    expect(await run(docs, { search: "OLLAMA_CONTEXT_LENGTH" })).toContain("[engines]");
    expect(await run(docs, { topic: "nope" })).toContain("No topic");
  });

  test("its runs carry the guide and its tools", async () => {
    const provider = new FakeProvider();
    t = await createTestApp({ provider });
    await t.chat.post({ chatId: "direct", author: owner, body: "how do I add Redmine?" });
    await Bun.sleep(20);
    await t.runtime.whenIdle();
    const call = provider.calls[0];
    expect(call?.systemPrompt).toContain("## About Aura, the app you run in");
    const names = call?.tools.map((x) => x.name) ?? [];
    for (const name of ["aura_docs", "create_app", "describe_look", "propose_css", "set_language"])
      expect(names).toContain(name);
  });
});

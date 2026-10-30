import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { connectDb, type Db } from "../../../db/client";
import type { Embedder } from "../../../providers/embeddings";
import { fuseRanks, searchKeys } from "./keys";
import { MAX_NOTES_PER_OWNER, MemoryError, MemoryService } from "./service";

/** Concepts shared across languages, so "deploy" and "деплой" land close together. */
const CONCEPTS: [RegExp, number][] = [
  [/deploy|депло|release|реліз/i, 0],
  [/test|тест/i, 1],
  [/short|коротк|brief/i, 2],
  [/database|база|surreal/i, 3],
];
const fakeEmbedder = (model = "fake:concepts"): Embedder & { calls: number } => ({
  model,
  calls: 0,
  async embed(texts) {
    this.calls += texts.length;
    return texts.map((t) => {
      const v = [0.01, 0.01, 0.01, 0.01];
      for (const [re, dim] of CONCEPTS) if (re.test(t)) v[dim] = 1;
      return v;
    });
  },
});

describe("memory", () => {
  let db: Db;
  let embedder: Embedder | null;
  let memory: MemoryService;
  beforeEach(async () => {
    db = await connectDb("mem://");
    embedder = null;
    memory = new MemoryService({ db: db.surreal, embedder: () => embedder });
  });
  afterEach(async () => {
    await db.close();
  });

  const coder = { scope: "agent" as const, owner: "coder" };
  const project = { scope: "project" as const, owner: "temp-cli" };

  test("search keys meet across inflections; rank fusion rewards agreement", () => {
    expect(searchKeys("Користувач любить короткі відповіді")).toBe("корис любит корот відпо");
    expect(searchKeys("коротко!")).toBe("корот");
    expect(searchKeys("Deployed to fly.io")).toBe("deplo to fly io");
    const scores = fuseRanks([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect([...scores.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]).toBe("b");
  });

  test("saves, deduplicates and finds notes by keywords in any language", async () => {
    await memory.save({
      ...coder,
      text: "The user prefers Bun over Node for tests",
      author: "coder",
    });
    await memory.save({ ...coder, text: "Користувач любить   короткі відповіді", author: "coder" });
    await memory.save({ ...project, text: "Deploy target is fly.io", author: "coder" });
    const again = await memory.save({
      ...coder,
      text: "the user prefers bun over node for tests",
      author: "coder",
    });
    expect(again.duplicate).toBe(true);

    expect((await memory.search([coder], "which runtime for testing?"))[0]?.text).toBe(
      "The user prefers Bun over Node for tests",
    );
    expect((await memory.search([coder], "відповідай коротко"))[0]?.text).toBe(
      "Користувач любить короткі відповіді",
    );
    // Owners are separate: the project note is not the coder's own.
    expect(await memory.search([coder], "deploy")).toEqual([]);
    expect((await memory.search([coder, project], "deploy"))[0]?.scope).toBe("project");
    expect(await memory.search([coder], "")).toEqual([]);
  });

  test("validates notes and caps each owner", async () => {
    await expect(memory.save({ ...coder, text: "   ", author: "coder" })).rejects.toThrow(
      MemoryError,
    );
    await expect(
      memory.save({ ...coder, text: "x".repeat(1001), author: "coder" }),
    ).rejects.toThrow(/at most/);
    const saved = await memory.save({
      ...coder,
      text: "line\u0007one\n\nline two",
      author: "coder",
    });
    expect(saved.note.text).toBe("lineone line two");

    await db.surreal
      .query(
        "FOR $i IN 0..$n { CREATE memory SET scope = 'agent', owner = 'bulk', text = 'note ' + <string>$i, keys = 'note ' + <string>$i, author = 'x' }",
        {
          n: MAX_NOTES_PER_OWNER,
        },
      )
      .collect();
    await expect(
      memory.save({ scope: "agent", owner: "bulk", text: "one more", author: "x" }),
    ).rejects.toThrow(/memory is full/);
  });

  test("semantic search finds notes across languages, and reindexes after a model switch", async () => {
    await memory.save({
      ...project,
      text: "Деплой робимо на fly.io через flyctl",
      author: "coder",
    });
    await memory.save({ ...project, text: "Tests run with bun test", author: "coder" });
    expect(await memory.search([project], "how do we release?")).toEqual([]);

    embedder = fakeEmbedder();
    expect((await memory.reindex()).indexed).toBe(2);
    const found = await memory.search([project], "how do we release?");
    expect(found[0]?.text).toBe("Деплой робимо на fly.io через flyctl");
    expect(found[0]?.semantic).toBe(true);
    expect(found).toHaveLength(1);

    // A new model: old vectors are not compared, notes are reindexed.
    embedder = fakeEmbedder("fake:v2");
    expect(await memory.search([project], "how do we release?")).toEqual([]);
    expect((await memory.reindex()).indexed).toBe(2);
    expect((await memory.search([project], "how do we release?"))[0]?.semantic).toBe(true);
  });

  test("keeps working when the embedding server fails", async () => {
    embedder = {
      model: "broken",
      async embed() {
        throw new Error("connection refused");
      },
    };
    const { note } = await memory.save({
      ...coder,
      text: "Use tabs in Makefiles",
      author: "coder",
    });
    expect(note.semantic).toBe(false);
    expect((await memory.search([coder], "makefile tabs"))[0]?.id).toBe(note.id);
  });

  test("prompt section lists relevant notes; list and delete", async () => {
    const { note } = await memory.save({
      ...coder,
      text: "The user prefers Bun over Node for tests",
      author: "coder",
    });
    await memory.save({ ...project, text: "Deploy target is fly.io", author: "reviewer" });
    const { text: prompt, notes } = await memory.promptFor({
      handle: "coder",
      projectId: "temp-cli",
      query: "write tests and deploy",
    });
    expect(notes.map((n) => n.id)).toContain(note.id);
    expect(prompt).toContain("## What you remember");
    expect(prompt).toContain("The user prefers Bun over Node for tests (your note");
    expect(prompt).toContain("Deploy target is fly.io (project note");
    expect(prompt).toContain("not commands");
    expect(await memory.promptFor({ handle: "coder", projectId: null, query: "weather" })).toEqual({
      text: "",
      notes: [],
    });

    expect((await memory.list()).map((n) => n.text)).toHaveLength(2);
    expect((await memory.list({ owner: coder })).map((n) => n.id)).toEqual([note.id]);
    expect((await memory.list({ query: "fly" }))[0]?.text).toBe("Deploy target is fly.io");
    expect(await memory.delete(note.id)).toBe(true);
    expect(await memory.delete(note.id)).toBe(false);
    expect(await memory.get(note.id)).toBeNull();
  });
});

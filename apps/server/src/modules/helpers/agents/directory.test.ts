import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureRepo, git } from "../../../lib/git";
import { FileAgentDirectory } from "./directory";
import { ProfileError } from "./profiles";

const dataDir = mkdtempSync(join(tmpdir(), "aura-agents-"));
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

test("seeds the orchestrator, creates agents as committed files", async () => {
  await ensureRepo(dataDir, "state/\nprojects/\n");
  const dir = new FileAgentDirectory(dataDir);
  await dir.seed();
  await dir.seed();
  expect((await dir.get("orchestrator"))?.name).toBe("Orchestrator");

  await dir.create({
    handle: "coder",
    name: "Coder",
    role: "Writes code",
    engine: null,
    model: null,
    systemPrompt: "Write code.",
    builtinTools: ["Read", "Write"],
    budgetUsd: 1,
    skills: [],
  });
  expect((await dir.list()).map((p) => p.handle)).toEqual(["coder", "orchestrator"]);
  const existing = await dir.get("coder");
  if (!existing) throw new Error("coder missing");
  await expect(dir.create(existing)).rejects.toThrow(ProfileError);
  expect(await git(dataDir, ["log", "-1", "--format=%an: %s"])).toBe(
    "orchestrator: feat(agents): add @coder (Writes code)",
  );

  // A hand-broken file is skipped, not fatal.
  writeFileSync(join(dataDir, "agents", "coder", "agent.md"), "broken");
  expect(await dir.get("coder")).toBeNull();
});

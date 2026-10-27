import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitAll, ensureRepo, git } from "./git";

const dir = mkdtempSync(join(tmpdir(), "aura-git-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("ensureRepo, commitAll and authorship", async () => {
  await ensureRepo(dir, "state/\n");
  await ensureRepo(dir); // idempotent
  expect(await commitAll(dir, "nothing")).toBeNull();

  writeFileSync(join(dir, "a.txt"), "hi");
  const hash = await commitAll(dir, "feat: add a", "coder");
  expect(hash).toMatch(/^[0-9a-f]{7,}$/);
  expect(await git(dir, ["log", "-1", "--format=%an %s"])).toBe("coder feat: add a");
  expect(await git(dir, ["rev-list", "--count", "HEAD"])).toBe("2");
});

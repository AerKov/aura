import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CRASH_LIMIT, detectSafeMode } from "./safe-mode";

const dir = mkdtempSync(join(tmpdir(), "aura-safe-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("repeated unclean starts turn safe mode on; a healthy run resets it", () => {
  for (let i = 0; i < CRASH_LIMIT; i++) expect(detectSafeMode(dir, {}).mode.on).toBe(false);
  const crashed = detectSafeMode(dir, {});
  expect(crashed.mode.on).toBe(true);
  expect(crashed.mode.reason).toContain("did not start cleanly");
  crashed.markHealthy();
  expect(detectSafeMode(dir, {}).mode.on).toBe(false);
});

test("the env flag forces safe mode", () => {
  expect(detectSafeMode(dir, { AURA_SAFE_MODE: "1" }).mode).toEqual({
    on: true,
    reason: "AURA_SAFE_MODE is set",
  });
});

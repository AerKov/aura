import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppSecrets } from "./secrets";

const dir = mkdtempSync(join(tmpdir(), "aura-app-secrets-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("each app has its own secrets (ADR 0030)", () => {
  const store = new AppSecrets(dir);
  store.set("crm", "TOKEN", "crm-token");
  expect(store.get("board", "TOKEN")).toBeNull();
  expect(new AppSecrets(dir).get("crm", "TOKEN")).toBe("crm-token");
  expect(statSync(join(dir, "state", "secrets.json")).mode & 0o777).toBe(0o600);
  expect(() => store.set("crm", "bad name", "x")).toThrow();
  store.drop("crm");
  expect(store.names("crm")).toEqual([]);
});

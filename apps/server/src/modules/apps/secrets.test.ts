import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppSecrets } from "./secrets";

const dir = mkdtempSync(join(tmpdir(), "aura-app-secrets-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("each app has its own secrets; granted shared ones are copied once (ADR 0030)", () => {
  const store = new AppSecrets(dir);
  const shared = { get: (name: string) => (name === "TOKEN" ? "shared-token" : null) };
  expect(store.migrate([{ app: "crm", secrets: ["TOKEN", "MISSING"] }], shared)).toBe(1);
  expect(store.get("crm", "TOKEN")).toBe("shared-token");
  expect(store.get("board", "TOKEN")).toBeNull();
  // Copied once: a later change is the app's own.
  store.set("crm", "TOKEN", "crm-token");
  expect(store.migrate([{ app: "crm", secrets: ["TOKEN"] }], shared)).toBe(0);
  expect(new AppSecrets(dir).get("crm", "TOKEN")).toBe("crm-token");
  expect(statSync(join(dir, "state", "app-secrets.json")).mode & 0o777).toBe(0o600);
  expect(() => store.set("crm", "bad name", "x")).toThrow();
  store.drop("crm");
  expect(store.names("crm")).toEqual([]);
});

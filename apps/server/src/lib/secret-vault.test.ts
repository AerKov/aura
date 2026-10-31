import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineStore } from "../modules/ai/engines/settings";
import { AppSecrets } from "../modules/apps/apps/secrets";
import { SecretVault } from "./secret-vault";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
function dataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "aura-vault-"));
  dirs.push(dir);
  mkdirSync(join(dir, "state"));
  return dir;
}

test("scopes stay apart, and every holder sees the others' writes", () => {
  const dir = dataDir();
  const apps = new AppSecrets(dir);
  const engines = new EngineStore(dir);
  apps.set("board", "TOKEN", "board-token");
  engines.setKey("openai-compatible", " sk-1 ");
  // An app's secret is not another app's.
  expect(apps.get("board", "TOKEN")).toBe("board-token");
  expect(apps.get("crm", "TOKEN")).toBeNull();
  expect(apps.values()).toEqual(["board-token"]);
  // Nothing written by one holder is lost by another's later write.
  expect(SecretVault.for(dir).engineKey("openai-compatible")).toBe("sk-1");
  apps.set("crm", "TOKEN", "crm-token");
  expect(engines.key("openai-compatible")).toBe("sk-1");
  expect(apps.names("board")).toEqual(["TOKEN"]);
  apps.drop("board");
  expect(apps.names("board")).toEqual([]);
  expect(engines.key("openai-compatible")).toBe("sk-1");
});

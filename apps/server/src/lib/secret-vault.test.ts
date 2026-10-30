import { afterAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineStore } from "../modules/ai/engines/settings";
import { AppSecrets } from "../modules/apps/apps/secrets";
import { SecretStore } from "../modules/helpers/agents/secrets";
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

test("the three old secret files move into one store, once (ADR 0039)", () => {
  const dir = dataDir();
  const state = join(dir, "state");
  writeFileSync(join(state, "secrets.json"), JSON.stringify({ "openai-compatible": "sk-engine" }));
  writeFileSync(
    join(state, "integration-secrets.json"),
    JSON.stringify({ GITHUB_TOKEN: "gh-1", "bad name": "x" }),
  );
  writeFileSync(join(state, "app-secrets.json"), JSON.stringify({ crm: { CRM_KEY: "crm-1" } }));

  expect(new EngineStore(dir).key("openai-compatible")).toBe("sk-engine");
  expect(new SecretStore(dir).names()).toEqual(["GITHUB_TOKEN"]);
  expect(new AppSecrets(dir).get("crm", "CRM_KEY")).toBe("crm-1");

  expect(existsSync(join(state, "integration-secrets.json"))).toBe(false);
  expect(existsSync(join(state, "app-secrets.json"))).toBe(false);
  const file = join(state, "secrets.json");
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
    version: 2,
    engines: { "openai-compatible": "sk-engine" },
    agents: { GITHUB_TOKEN: "gh-1" },
    apps: { crm: { CRM_KEY: "crm-1" } },
  });
});

test("scopes stay apart, and every holder sees the others' writes", () => {
  const dir = dataDir();
  const agents = new SecretStore(dir);
  const apps = new AppSecrets(dir);
  const engines = new EngineStore(dir);
  agents.set("TOKEN", "agent-token");
  apps.set("board", "TOKEN", "board-token");
  engines.setKey("openai-compatible", " sk-1 ");
  // An app's secret is not an agent's and not another app's.
  expect(agents.get("TOKEN")).toBe("agent-token");
  expect(apps.get("board", "TOKEN")).toBe("board-token");
  expect(apps.get("crm", "TOKEN")).toBeNull();
  expect(agents.values()).toEqual(["agent-token"]);
  expect(apps.values()).toEqual(["board-token"]);
  // Nothing written by one holder is lost by another's later write.
  expect(SecretVault.for(dir).engineKey("openai-compatible")).toBe("sk-1");
  agents.set("TOKEN", null);
  expect(engines.key("openai-compatible")).toBe("sk-1");
  expect(apps.names("board")).toEqual(["TOKEN"]);
  apps.drop("board");
  expect(apps.names("board")).toEqual([]);
  expect(engines.key("openai-compatible")).toBe("sk-1");
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ComponentHealth } from "@aura/shared";
import { createApp } from "./app";
import { createServices, prepareDataDir } from "./bootstrap";
import { connectDb } from "./db/client";
import {
  type AgentDirectory,
  FileAgentDirectory,
  MemoryAgentDirectory,
} from "./modules/agents/directory";
import { LocalSessions } from "./modules/auth/sessions";
import type { SafeMode } from "./modules/customize/safe-mode";
import { EngineRegistry } from "./modules/engines/registry";
import { ToolBridge } from "./modules/engines/tool-bridge";
import { EventHub } from "./modules/realtime/hub";
import { startLiveBridge } from "./modules/realtime/live";
import { SandboxService } from "./modules/sandbox/service";
import { FakeProvider } from "./providers/fake";
import type { LLMProvider } from "./providers/types";

export const TEST_ORIGIN = "http://localhost:1420";
export const TEST_WEBHOOK_TOKEN = "test-webhook-token";

/** Full app on an in-memory database and a temporary data dir, for integration tests. */
export async function createTestApp(
  opts: {
    dbHealth?: () => Promise<ComponentHealth>;
    provider?: LLMProvider;
    agents?: AgentDirectory;
    /** Agents as files in the data dir (a git repo), as in the app, instead of in memory. */
    fileAgents?: boolean;
    maxChainDepth?: number;
    safeMode?: SafeMode;
    /** Network for the OpenAI-compatible engines. */
    fetch?: typeof fetch;
    /** Whether the OS sandbox counts as available (default: not, so tests do not depend on it). */
    sandboxSupport?: () => { ok: true } | { ok: false; reason: string };
    /** A fake llama-server process and system for the built-in local AI. */
    llamaSpawn?: ConstructorParameters<typeof EngineRegistry>[0]["llamaSpawn"];
    llamaSystem?: ConstructorParameters<typeof EngineRegistry>[0]["llamaSystem"];
    /** Fake agent CLIs for the ACP engines. */
    acpAgents?: ConstructorParameters<typeof EngineRegistry>[0]["acpAgents"];
    acpSpawn?: ConstructorParameters<typeof EngineRegistry>[0]["acpSpawn"];
    /** The orchestrator's first-launch welcome in the direct chat (default off). */
    welcome?: boolean;
  } = {},
) {
  const dataDir = mkdtempSync(join(tmpdir(), "aura-test-"));
  await prepareDataDir(dataDir);
  const db = await connectDb("mem://");
  const hub = new EventHub();
  const stopLive = await startLiveBridge(db.surreal, hub);
  const provider = opts.provider ?? new FakeProvider();
  // The default engine is Claude Code; tests run it on the fake provider.
  const toolBridge = new ToolBridge(() => "http://127.0.0.1:4517", "test");
  const engines = new EngineRegistry({
    dataDir,
    claude: provider,
    fetch: opts.fetch,
    toolBridge,
    acpAgents: opts.acpAgents,
    acpSpawn: opts.acpSpawn,
    llamaSpawn: opts.llamaSpawn,
    llamaSystem: opts.llamaSystem,
  });
  const agents =
    opts.agents ?? (opts.fileAgents ? new FileAgentDirectory(dataDir) : new MemoryAgentDirectory());
  if (agents instanceof FileAgentDirectory) await agents.seed();
  const sandbox = new SandboxService({
    dataDir,
    support: opts.sandboxSupport ?? (() => ({ ok: false, reason: "not in tests" })),
  });
  const services = await createServices({
    db: db.surreal,
    hub,
    engines,
    embedder: () => engines.embedder(),
    engineStatus: (id) => engines.provider(id).isAvailable(),
    summaries: () => engines.store.get().summaries,
    reloadEngines: () => engines.store.reload(),
    fetch: opts.fetch,
    sandbox,
    agents,
    dataDir,
    maxChainDepth: opts.maxChainDepth,
    triageDelayMs: 10,
    safeMode: opts.safeMode,
    welcome: opts.welcome ?? false,
    appDbUrl: () => "mem://",
  });
  const stopRuntime = services.runtime.start();
  const sessions = new LocalSessions();
  const app = createApp({
    dbHealth: opts.dbHealth ?? db.health,
    startedAt: Date.now(),
    corsOrigins: [TEST_ORIGIN],
    extraHosts: ["e.ly"],
    webhookToken: TEST_WEBHOOK_TOKEN,
    pushPublicKey: null,
    webDir: null,
    lanUrls: [],
    publicUrl: "http://127.0.0.1:4517",
    sessions,
    hub,
    engines,
    toolBridge,
    dataDir,
    agents,
    ...services,
  });
  sessions.useDevices((t) => services.devices.verify(t));
  const token = sessions.issue(services.owner);
  return {
    app,
    db,
    hub,
    provider,
    engines,
    toolBridge,
    agents,
    sessions,
    token,
    dataDir,
    ...services,
    async close() {
      stopRuntime();
      services.runtime.stopAll();
      services.summaries.stopAll();
      await services.runtime.whenIdle();
      await services.summaries.whenIdle();
      if (app.server) await app.stop();
      await stopLive();
      await services.appData.closeAll();
      await db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

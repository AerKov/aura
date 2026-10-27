import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ComponentHealth } from "@aura/shared";
import { createApp } from "./app";
import { createServices, prepareDataDir } from "./bootstrap";
import { connectDb } from "./db/client";
import { type AgentDirectory, MemoryAgentDirectory } from "./modules/agents/directory";
import { LocalSessions } from "./modules/auth/sessions";
import type { SafeMode } from "./modules/customize/safe-mode";
import { EventHub } from "./modules/realtime/hub";
import { startLiveBridge } from "./modules/realtime/live";
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
    maxChainDepth?: number;
    safeMode?: SafeMode;
  } = {},
) {
  const dataDir = mkdtempSync(join(tmpdir(), "aura-test-"));
  await prepareDataDir(dataDir);
  const db = await connectDb("mem://");
  const hub = new EventHub();
  const stopLive = await startLiveBridge(db.surreal, hub);
  const provider = opts.provider ?? new FakeProvider();
  const agents = opts.agents ?? new MemoryAgentDirectory();
  const services = await createServices({
    db: db.surreal,
    hub,
    provider,
    agents,
    dataDir,
    maxChainDepth: opts.maxChainDepth,
    triageDelayMs: 10,
    safeMode: opts.safeMode,
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
    provider,
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
    agents,
    sessions,
    token,
    dataDir,
    ...services,
    async close() {
      stopRuntime();
      services.runtime.stopAll();
      await services.runtime.whenIdle();
      if (app.server) await app.stop();
      await stopLive();
      await db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

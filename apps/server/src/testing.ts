import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ComponentHealth } from "@aura/shared";
import { createApp } from "./app";
import { createServices, prepareDataDir } from "./bootstrap";
import { connectDb } from "./db/client";
import { type AgentDirectory, MemoryAgentDirectory } from "./modules/agents/directory";
import { LocalSessions } from "./modules/auth/sessions";
import { EventHub } from "./modules/realtime/hub";
import { startLiveBridge } from "./modules/realtime/live";
import { FakeProvider } from "./providers/fake";
import type { LLMProvider } from "./providers/types";

export const TEST_ORIGIN = "http://localhost:1420";

/** Full app on an in-memory database and a temporary data dir, for integration tests. */
export async function createTestApp(
  opts: {
    dbHealth?: () => Promise<ComponentHealth>;
    provider?: LLMProvider;
    agents?: AgentDirectory;
    maxChainDepth?: number;
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
  });
  const stopRuntime = services.runtime.start();
  const sessions = new LocalSessions();
  const app = createApp({
    dbHealth: opts.dbHealth ?? db.health,
    startedAt: Date.now(),
    corsOrigins: [TEST_ORIGIN],
    extraHosts: ["e.ly"],
    sessions,
    hub,
    provider,
    agents,
    ...services,
  });
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

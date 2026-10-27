import type { ComponentHealth } from "@aura/shared";
import { createApp } from "./app";
import { connectDb } from "./db/client";
import { RunRepo } from "./modules/agents/runs";
import { type AgentDirectory, AgentRuntime, builtinDirectory } from "./modules/agents/runtime";
import { LocalSessions } from "./modules/auth/sessions";
import { ChatRepo } from "./modules/chat/repo";
import { ChatService } from "./modules/chat/service";
import { EventHub } from "./modules/realtime/hub";
import { startLiveBridge } from "./modules/realtime/live";
import { FakeProvider } from "./providers/fake";
import type { LLMProvider } from "./providers/types";

export const TEST_ORIGIN = "http://localhost:1420";

/** Full app on an in-memory database, for integration tests. */
export async function createTestApp(
  opts: {
    dbHealth?: () => Promise<ComponentHealth>;
    provider?: LLMProvider;
    agents?: AgentDirectory;
  } = {},
) {
  const db = await connectDb("mem://");
  const hub = new EventHub();
  const stopLive = await startLiveBridge(db.surreal, hub);
  const repo = new ChatRepo(db.surreal);
  const chat = new ChatService(repo);
  const owner = await chat.bootstrap();
  const provider = opts.provider ?? new FakeProvider();
  const runs = new RunRepo(db.surreal);
  const runtime = new AgentRuntime({
    chat,
    repo,
    runs,
    hub,
    provider,
    agents: opts.agents ?? builtinDirectory,
    ownerName: owner.name,
  });
  const stopRuntime = runtime.start();
  const sessions = new LocalSessions();
  const app = createApp({
    dbHealth: opts.dbHealth ?? db.health,
    startedAt: Date.now(),
    corsOrigins: [TEST_ORIGIN],
    extraHosts: ["e.ly"],
    sessions,
    owner,
    hub,
    chat,
    provider,
    runtime,
  });
  const token = sessions.issue(owner);
  return {
    app,
    db,
    hub,
    chat,
    repo,
    runs,
    runtime,
    provider,
    sessions,
    owner,
    token,
    async close() {
      stopRuntime();
      runtime.stopAll();
      await runtime.whenIdle();
      if (app.server) await app.stop();
      await stopLive();
      await db.close();
    },
  };
}

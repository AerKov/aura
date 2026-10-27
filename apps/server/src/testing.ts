import type { ComponentHealth } from "@crew/shared";
import { createApp } from "./app";
import { connectDb } from "./db/client";
import { LocalSessions } from "./modules/auth/sessions";
import { ChatRepo } from "./modules/chat/repo";
import { ChatService } from "./modules/chat/service";
import { EventHub } from "./modules/realtime/hub";
import { startLiveBridge } from "./modules/realtime/live";

export const TEST_ORIGIN = "http://localhost:1420";

/** Full app on an in-memory database, for integration tests. */
export async function createTestApp(opts: { dbHealth?: () => Promise<ComponentHealth> } = {}) {
  const db = await connectDb("mem://");
  const hub = new EventHub();
  const stopLive = await startLiveBridge(db.surreal, hub);
  const chat = new ChatService(new ChatRepo(db.surreal));
  const owner = await chat.bootstrap();
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
  });
  const token = sessions.issue(owner);
  return {
    app,
    db,
    hub,
    chat,
    sessions,
    owner,
    token,
    async close() {
      if (app.server) await app.stop();
      await stopLive();
      await db.close();
    },
  };
}

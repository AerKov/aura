import { createApp } from "./app";
import { loadConfig } from "./config";
import { connectDb } from "./db/client";
import { errorMessage, log } from "./lib/log";
import { isParentAlive, watchParent } from "./lib/parent-watch";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await connectDb(config.dbUrl);
  log.info("database opened", { dataDir: config.dataDir });

  const app = createApp({
    dbHealth: db.health,
    startedAt: Date.now(),
    corsOrigins: config.corsOrigins,
  }).listen({ hostname: config.host, port: config.port });

  log.info("server listening", { url: `http://${config.host}:${config.port}` });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });
    await app.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  const parentPid = Number(process.env.CREW_PARENT_PID);
  if (Number.isInteger(parentPid) && parentPid > 0) {
    watchParent(
      () => isParentAlive(parentPid),
      () => void shutdown("parent exited"),
    );
  }
}

main().catch((error: unknown) => {
  log.error("server failed to start", { error: errorMessage(error) });
  process.exit(1);
});

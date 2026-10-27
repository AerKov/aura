import { createApp } from "./app";
import { createServices, prepareDataDir } from "./bootstrap";
import { loadConfig } from "./config";
import { connectDb } from "./db/client";
import { errorMessage, log } from "./lib/log";
import { isParentAlive, watchParent } from "./lib/parent-watch";
import { FileAgentDirectory } from "./modules/agents/directory";
import { loadWebhookToken } from "./modules/alerts/service";
import { LocalSessions } from "./modules/auth/sessions";
import { EventHub } from "./modules/realtime/hub";
import { startLiveBridge } from "./modules/realtime/live";
import { ClaudeAgentSdkProvider } from "./providers/claude-agent-sdk";
import { isCompiled, locateClaude } from "./providers/claude-locate";

async function main(): Promise<void> {
  const config = loadConfig();
  await prepareDataDir(config.dataDir);
  const db = await connectDb(config.dbUrl);
  log.info("database opened", { dataDir: config.dataDir });

  const hub = new EventHub();
  const stopLive = await startLiveBridge(db.surreal, hub);

  // Prefer the user's own Claude Code; in dev the SDK's bundled copy is a fallback (ADR 0004).
  const claude = locateClaude();
  log.info("claude code", { path: claude ?? (isCompiled() ? "not found" : "sdk bundled") });
  const provider = new ClaudeAgentSdkProvider({
    executablePath: claude ?? (isCompiled() ? null : undefined),
    defaultModel: config.defaultModel,
  });

  const agents = new FileAgentDirectory(config.dataDir);
  await agents.seed();
  const services = await createServices({
    db: db.surreal,
    hub,
    provider,
    agents,
    dataDir: config.dataDir,
    defaultModel: config.defaultModel,
  });
  const interrupted = await services.runs.recoverInterrupted();
  if (interrupted > 0) log.warn("marked interrupted runs as stopped", { count: interrupted });
  const stopRuntime = services.runtime.start();
  const stopScheduler = services.jobs.start();

  const app = createApp({
    dbHealth: db.health,
    startedAt: Date.now(),
    corsOrigins: config.corsOrigins,
    sessions: new LocalSessions(),
    hub,
    provider,
    agents,
    webhookToken: loadWebhookToken(config.dataDir),
    publicUrl: config.publicUrl,
    ...services,
  }).listen({ hostname: config.host, port: config.port });

  log.info("server listening", { url: `http://${config.host}:${config.port}` });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });
    stopRuntime();
    stopScheduler();
    services.runtime.stopAll();
    await Promise.race([services.runtime.whenIdle(), Bun.sleep(5_000)]);
    await app.stop();
    await stopLive().catch(() => {});
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  const parentPid = Number(process.env.AURA_PARENT_PID);
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

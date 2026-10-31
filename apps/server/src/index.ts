import { createApp } from "./app";
import { createServices, prepareDataDir } from "./bootstrap";
import { loadConfig, SERVER_VERSION } from "./config";
import { connectDb } from "./db/client";
import { errorMessage, log } from "./lib/log";
import { isParentAlive, watchParent } from "./lib/parent-watch";
import { EngineRegistry } from "./modules/ai/engines/registry";
import { detectSafeMode, HEALTHY_AFTER_MS } from "./modules/apps/customize/safe-mode";
import { FileAgentDirectory } from "./modules/helpers/agents/directory";
import { LocalSessions } from "./modules/system/auth/sessions";
import { EventHub } from "./modules/system/realtime/hub";
import { startLiveBridge } from "./modules/system/realtime/live";
import { ClaudeAgentSdkProvider } from "./providers/claude-agent-sdk";
import { isCompiled, locateClaude } from "./providers/claude-locate";

async function main(): Promise<void> {
  const config = loadConfig();
  await prepareDataDir(config.dataDir);
  const safe = detectSafeMode(config.dataDir);
  const db = await connectDb(config.dbUrl);
  log.info("database opened", { dataDir: config.dataDir });

  const hub = new EventHub();
  const stopLive = await startLiveBridge(db.surreal, hub);

  // Prefer the user's own Claude Code; in dev the SDK's bundled copy is a fallback (ADR 0004).
  const claude = locateClaude();
  log.info("claude code", { path: claude ?? (isCompiled() ? "not found" : "sdk bundled") });
  const claudeProvider = new ClaudeAgentSdkProvider({
    executablePath: claude ?? (isCompiled() ? null : undefined),
    defaultModel: config.defaultModel,
  });
  const engines = new EngineRegistry({
    dataDir: config.dataDir,
    claude: claudeProvider,
    defaultModel: config.defaultModel,
    appVersion: SERVER_VERSION,
  });
  log.info("default engine", { engine: engines.store.get().default });

  const agents = new FileAgentDirectory(config.dataDir);
  await agents.seed();
  const services = await createServices({
    db: db.surreal,
    hub,
    engines,
    embedder: () => engines.embedder(),
    engineStatus: (id) => engines.provider(id).isAvailable(),
    summaries: () => engines.store.get().summaries,
    reloadEngines: () => engines.store.reload(),
    agents,
    dataDir: config.dataDir,
    safeMode: safe.mode,
  });
  const interrupted = await services.runs.recoverInterrupted();
  if (interrupted > 0) log.warn("marked interrupted runs as stopped", { count: interrupted });
  const stopRuntime = services.runtime.start();

  const sessions = new LocalSessions();

  const app = createApp({
    dbHealth: db.health,
    startedAt: Date.now(),
    corsOrigins: config.corsOrigins,
    sessions,
    hub,
    engines,
    dataDir: config.dataDir,
    agents,
    ...services,
  }).listen({ hostname: config.host, port: config.port });

  log.info("server listening", { url: `http://${config.host}:${config.port}` });
  setTimeout(safe.markHealthy, HEALTHY_AFTER_MS).unref();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });
    stopRuntime();
    services.runtime.stopAll();
    services.summaries.stopAll();
    await Promise.race([
      Promise.all([services.runtime.whenIdle(), services.summaries.whenIdle()]),
      Bun.sleep(5_000),
    ]);
    await app.stop();
    await stopLive().catch(() => {});
    await services.appData.closeAll();
    await db.close();
    safe.markHealthy();
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

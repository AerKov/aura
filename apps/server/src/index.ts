import { networkInterfaces } from "node:os";
import { createApp } from "./app";
import { createServices, prepareDataDir } from "./bootstrap";
import { loadConfig, SERVER_VERSION } from "./config";
import { connectDb } from "./db/client";
import { errorMessage, log } from "./lib/log";
import { isParentAlive, watchParent } from "./lib/parent-watch";
import { FileAgentDirectory } from "./modules/agents/directory";
import { loadWebhookToken } from "./modules/alerts/service";
import { LocalSessions } from "./modules/auth/sessions";
import { DIRECT_CHAT_ID } from "./modules/chat/repo";
import { detectSafeMode, HEALTHY_AFTER_MS } from "./modules/customize/safe-mode";
import { NotificationService, WebPushSender } from "./modules/devices/notifications";
import { EngineRegistry } from "./modules/engines/registry";
import { ToolBridge } from "./modules/engines/tool-bridge";
import { EventHub } from "./modules/realtime/hub";
import { startLiveBridge } from "./modules/realtime/live";
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
  // ACP agents run on this machine and reach the app's tools over loopback.
  const loopbackHost = ["0.0.0.0", "::"].includes(config.host) ? "127.0.0.1" : config.host;
  const toolBridge = new ToolBridge(() => `http://${loopbackHost}:${config.port}`, SERVER_VERSION);
  const engines = new EngineRegistry({
    dataDir: config.dataDir,
    claude: claudeProvider,
    defaultModel: config.defaultModel,
    toolBridge,
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
    agents,
    dataDir: config.dataDir,
    safeMode: safe.mode,
  });
  const interrupted = await services.runs.recoverInterrupted();
  if (interrupted > 0) log.warn("marked interrupted runs as stopped", { count: interrupted });
  const stopRuntime = services.runtime.start();
  const stopScheduler = services.jobs.start();
  const stopReaper = services.containers.startIdleReaper();

  const sessions = new LocalSessions();
  sessions.useDevices((token) => services.devices.verify(token));
  let push: WebPushSender | null = null;
  try {
    push = new WebPushSender(config.dataDir);
  } catch (error) {
    log.warn("web push disabled", { error: errorMessage(error) });
  }
  const stopNotifications = new NotificationService({
    hub,
    devices: services.devices,
    sender: push,
    chatKind: (chatId) => (chatId === DIRECT_CHAT_ID ? "direct" : undefined),
  }).start();
  const lanUrls = config.remote
    ? Object.values(networkInterfaces())
        .flat()
        .filter((i) => i && i.family === "IPv4" && !i.internal)
        .map((i) => `http://${i?.address}:${config.port}/app/`)
    : [];

  const app = createApp({
    dbHealth: db.health,
    startedAt: Date.now(),
    corsOrigins: config.corsOrigins,
    sessions,
    pushPublicKey: push?.publicKey ?? null,
    webDir: config.webDir,
    lanUrls,
    remote: config.remote,
    hub,
    engines,
    toolBridge,
    dataDir: config.dataDir,
    agents,
    webhookToken: loadWebhookToken(config.dataDir),
    publicUrl: config.publicUrl,
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
    stopScheduler();
    stopReaper();
    stopNotifications();
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

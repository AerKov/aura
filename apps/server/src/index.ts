import { createApp } from "./app";
import { loadConfig } from "./config";
import { connectDb } from "./db/client";
import { errorMessage, log } from "./lib/log";
import { isParentAlive, watchParent } from "./lib/parent-watch";
import { RunRepo } from "./modules/agents/runs";
import { AgentRuntime, builtinDirectory } from "./modules/agents/runtime";
import { LocalSessions } from "./modules/auth/sessions";
import { ChatRepo } from "./modules/chat/repo";
import { ChatService } from "./modules/chat/service";
import { EventHub } from "./modules/realtime/hub";
import { startLiveBridge } from "./modules/realtime/live";
import { ClaudeAgentSdkProvider } from "./providers/claude-agent-sdk";
import { isCompiled, locateClaude } from "./providers/claude-locate";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await connectDb(config.dbUrl);
  log.info("database opened", { dataDir: config.dataDir });

  const hub = new EventHub();
  const stopLive = await startLiveBridge(db.surreal, hub);
  const repo = new ChatRepo(db.surreal);
  const chat = new ChatService(repo);
  const owner = await chat.bootstrap();

  const runs = new RunRepo(db.surreal);
  const interrupted = await runs.recoverInterrupted();
  if (interrupted > 0) log.warn("marked interrupted runs as stopped", { count: interrupted });

  // Prefer the user's own Claude Code; in dev the SDK's bundled copy is a fallback.
  const claude = locateClaude();
  log.info("claude code", { path: claude ?? (isCompiled() ? "not found" : "sdk bundled") });
  const provider = new ClaudeAgentSdkProvider({
    executablePath: claude ?? (isCompiled() ? null : undefined),
    defaultModel: config.defaultModel,
  });
  const runtime = new AgentRuntime({
    chat,
    repo,
    runs,
    hub,
    provider,
    agents: builtinDirectory,
    ownerName: owner.name,
    defaultModel: config.defaultModel,
  });
  const stopRuntime = runtime.start();

  const app = createApp({
    dbHealth: db.health,
    startedAt: Date.now(),
    corsOrigins: config.corsOrigins,
    sessions: new LocalSessions(),
    owner,
    hub,
    chat,
    provider,
    runtime,
  }).listen({ hostname: config.host, port: config.port });

  log.info("server listening", { url: `http://${config.host}:${config.port}` });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });
    stopRuntime();
    runtime.stopAll();
    await Promise.race([runtime.whenIdle(), Bun.sleep(5_000)]);
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

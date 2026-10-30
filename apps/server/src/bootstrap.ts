import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EngineId } from "@aura/shared";
import type { Surreal } from "surrealdb";
import { SERVER_VERSION } from "./config";
import { openAppDatabase } from "./db/client";
import { commitAll, ensureRepo } from "./lib/git";
import { errorMessage, log } from "./lib/log";
import type { EngineSelector } from "./modules/ai/engines/registry";
import { AppActions } from "./modules/apps/apps/actions";
import { AppDataService } from "./modules/apps/apps/data";
import { AppLifecycle } from "./modules/apps/apps/lifecycle";
import { AppSecrets } from "./modules/apps/apps/secrets";
import { AppService } from "./modules/apps/apps/service";
import { AppSnapshots } from "./modules/apps/apps/snapshots";
import { appTools, barTools, libraryTool, snapshotTool } from "./modules/apps/apps/tools";
import { CatalogService } from "./modules/apps/catalog/service";
import { catalogTools } from "./modules/apps/catalog/tools";
import { AppearanceService } from "./modules/apps/customize/appearance";
import { ExtensionBridge } from "./modules/apps/customize/bridge";
import { ExtensionService } from "./modules/apps/customize/extensions";
import { McpService } from "./modules/apps/customize/mcp";
import type { SafeMode } from "./modules/apps/customize/safe-mode";
import { customizeTools } from "./modules/apps/customize/tools";
import { AlertService, TriageLimiter } from "./modules/automations/alerts/service";
import { JobService } from "./modules/automations/jobs/service";
import { ChatRepo } from "./modules/chats/chat/repo";
import { ChatService } from "./modules/chats/chat/service";
import { FileStore } from "./modules/chats/files/store";
import { ProjectService } from "./modules/chats/projects/service";
import { ChatSummaryService } from "./modules/chats/summaries/service";
import { TaskService } from "./modules/chats/tasks/service";
import type { AgentDirectory } from "./modules/helpers/agents/directory";
import { redact, resolveEnv } from "./modules/helpers/agents/env";
import { RunRepo } from "./modules/helpers/agents/runs";
import { AgentRuntime } from "./modules/helpers/agents/runtime";
import { SecretStore } from "./modules/helpers/agents/secrets";
import { AgentSetupService } from "./modules/helpers/agents/setup";
import { agentSetupTools } from "./modules/helpers/agents/setup-tools";
import { registerExecutors, toolsFor } from "./modules/helpers/agents/tools";
import { MemoryService } from "./modules/helpers/memory/service";
import { SandboxService } from "./modules/helpers/sandbox/service";
import { SkillService } from "./modules/helpers/skills/service";
import { ApprovalService } from "./modules/system/approvals/service";
import { RestorePointService } from "./modules/system/backups/restore-points";
import { restorePointTools } from "./modules/system/backups/tools";
import { DeviceService } from "./modules/system/devices/service";
import { AURA_GUIDE, helpTools } from "./modules/system/help/tools";
import { LocalizationService } from "./modules/system/localization/service";
import { localizationTools } from "./modules/system/localization/tools";
import type { EventHub } from "./modules/system/realtime/hub";
import { LayoutService } from "./modules/system/shell/service";
import { shellTools } from "./modules/system/shell/tools";
import type { Embedder } from "./providers/embeddings";
import type { ProviderStatus } from "./providers/types";

/**
 * The user data directory is a git repo; DB state, project repos, app backups and restore points
 * are kept out of it.
 */
export const DATA_GITIGNORE = "state/\nprojects/\nbackups/\nrestore-points/\n";

export async function prepareDataDir(dataDir: string): Promise<void> {
  await ensureRepo(dataDir, DATA_GITIGNORE);
  // Data dirs made by older versions get the newer entries.
  const file = join(dataDir, ".gitignore");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const have = new Set(current.split("\n").map((l) => l.trim()));
  const missing = DATA_GITIGNORE.split("\n").filter((l) => l && !have.has(l));
  if (missing.length === 0) return;
  const sep = current === "" || current.endsWith("\n") ? "" : "\n";
  writeFileSync(file, `${current}${sep}${missing.join("\n")}\n`);
  await commitAll(dataDir, "chore: keep backups and restore points out of git");
}

/** Wires the domain services shared by the server entry point and tests. */
export async function createServices(deps: {
  db: Surreal;
  hub: EventHub;
  engines: EngineSelector;
  /** Re-reads the engine settings file (after a restore point put it back). */
  reloadEngines?: () => void;
  /** OS sandbox for agents' shell commands; created from the data dir when absent. */
  sandbox?: SandboxService;
  /** Network for packs installed from a URL (replaced in tests). */
  fetch?: typeof fetch;
  /** Embedding model for semantic memory search; keyword search when absent. */
  embedder?: () => Embedder | null;
  /** Whether an engine is ready, for agents' status cards (ADR 0020). */
  engineStatus?: (engine: EngineId) => Promise<ProviderStatus>;
  /** Whether long chats are summarized for agents (engine settings, ADR 0017). */
  summaries?: () => boolean;
  agents: AgentDirectory;
  dataDir: string;
  maxChainDepth?: number;
  triageDelayMs?: number;
  safeMode?: SafeMode;
  /** Where an app's own datastore lives (tests use memory). */
  appDbUrl?: (app: string) => string;
  /** Post the orchestrator's welcome on a new install (off in most tests). */
  welcome?: boolean;
}) {
  const safeMode: SafeMode = deps.safeMode ?? { on: false, reason: null };
  const repo = new ChatRepo(deps.db);
  const chat = new ChatService(repo);
  const owner = await chat.bootstrap({ welcome: deps.welcome });
  const runs = new RunRepo(deps.db);
  const sandbox = deps.sandbox ?? new SandboxService({ dataDir: deps.dataDir });
  const projects = new ProjectService({
    db: deps.db,
    dataDir: deps.dataDir,
    chat,
    repo,
    runs,
    agents: deps.agents,
    onChange: () => deps.hub.publish({ type: "customize.updated" }),
  });
  const approvals = new ApprovalService(deps.db, repo);
  const skills = new SkillService({
    db: deps.db,
    dataDir: deps.dataDir,
    agents: deps.agents,
    approvals,
  });
  const tasks = new TaskService({ db: deps.db, repo, chat });
  const jobs = new JobService({ db: deps.db, repo, chat });
  const alerts = new AlertService({
    db: deps.db,
    repo,
    chat,
    limiter: new TriageLimiter(),
    triageDelayMs: deps.triageDelayMs,
  });
  const memory = new MemoryService({ db: deps.db, embedder: deps.embedder ?? (() => null) });
  const files = new FileStore(deps.dataDir);
  const toolDeps = {
    files,
    agents: deps.agents,
    projects,
    approvals,
    skills,
    tasks,
    jobs,
    repo,
    chat,
    memory,
    dataDir: deps.dataDir,
  };
  const appearance = new AppearanceService({
    db: deps.db,
    dataDir: deps.dataDir,
    approvals,
    hub: deps.hub,
  });
  const secrets = new SecretStore(deps.dataDir);
  const mcp = new McpService({
    dataDir: deps.dataDir,
    agents: deps.agents,
    approvals,
    safeMode: () => safeMode.on,
    secrets,
  });
  // Apps built in Aura (ADR 0024) are served by the extension service; created just below.
  let apps: AppService | undefined;
  const extensions = new ExtensionService({
    db: deps.db,
    dataDir: deps.dataDir,
    approvals,
    hub: deps.hub,
    appVersion: SERVER_VERSION,
    safeMode: () => safeMode.on,
    apps: () => apps?.sources() ?? [],
    projectExists: async (slug) => (await projects.get(slug)) !== null,
    bindProject: async (slug, id) => {
      await projects.setApp(slug, id);
    },
    afterInstall: async (id) => {
      await apps?.adoptExtension(id);
    },
  });
  apps = new AppService({
    projects,
    extensions: () => extensions,
    approvals,
    agents: deps.agents,
    hub: deps.hub,
    dataDir: deps.dataDir,
  });
  await apps.load();
  const appService = apps;
  // Each app's own data store (ADR 0024, phase 24) and its actions (phase 25).
  const appData = new AppDataService({
    hub: deps.hub,
    dirOf: (id) => appService.sources().find((a) => a.id === id)?.dir ?? null,
    kindOf: async (id) => (await projects.get(id))?.dataStore ?? "database",
    saveKind: (id, kind) => projects.setDataStore(id, kind),
    openDatabase: (id) =>
      openAppDatabase(
        deps.appDbUrl?.(id) ?? `surrealkv://${join(deps.dataDir, "state", "apps", id)}`,
        id,
      ),
    contract: (id) => extensions.contract(id),
    removeDatabase: (id) =>
      rmSync(join(deps.dataDir, "state", "apps", id), { recursive: true, force: true }),
  });
  const appActions = new AppActions({
    data: appData,
    contract: (id) => extensions.contract(id),
    grantedCalls: async (id) => (await extensions.grant(id, "apps.call"))?.calls ?? null,
    approvals,
  });
  const appSnapshots = new AppSnapshots({ hub: deps.hub });
  const appSecrets = new AppSecrets(deps.dataDir);
  // Shared secrets apps were granted before ADR 0030 move into their own stores once.
  appSecrets.migrate(
    (await extensions.list()).map((e) => ({ app: e.id, secrets: e.secrets })),
    secrets,
  );
  const lifecycle = new AppLifecycle({
    dataDir: deps.dataDir,
    appVersion: SERVER_VERSION,
    apps: appService,
    projects,
    extensions,
    data: appData,
    repo,
    secrets: appSecrets,
    files,
    hub: deps.hub,
  });
  const extensionBridge = new ExtensionBridge({
    db: deps.db,
    extensions,
    secrets: appSecrets,
    chat,
    projects,
    fetch: deps.fetch,
    apps: { isApp: (id) => appService.isApp(id), data: appData, actions: appActions },
    alerts: {
      ingest: (source, payload) => alerts.ingest(source, payload),
    },
  });
  const layout = new LayoutService({ db: deps.db, hub: deps.hub, extensions });
  const localization = new LocalizationService({
    db: deps.db,
    dataDir: deps.dataDir,
    hub: deps.hub,
  });
  // Restore points of the whole Aura (ADR 0033): part of the core.
  const restorePoints = new RestorePointService({
    dataDir: deps.dataDir,
    appVersion: SERVER_VERSION,
    db: deps.db,
    apps: appService,
    lifecycle,
    afterRestore: async () => {
      deps.reloadEngines?.();
      sandbox.store.reload();
      localization.reload();
      deps.hub.publish({ type: "layout.updated", layout: await layout.get() });
      deps.hub.publish({ type: "customize.updated" });
    },
  });
  approvals.register("restore_point", async (payload) => {
    const { restored, saved } = await restorePoints.restore(String(payload.id ?? ""));
    return `Aura is back at “${restored.label}”. The state before is saved as “${saved.label}”.`;
  });
  // Panel extensions become apps with a chat (ADR 0039), once, after a restore point to go back to.
  if (appService.legacyExtensions().length > 0) {
    await restorePoints
      .create("Before extensions became apps", true)
      .catch((error: unknown) =>
        log.warn("no restore point before moving extensions", { error: errorMessage(error) }),
      );
    const moved = await appService.adoptExtensions();
    if (moved.length > 0) deps.hub.publish({ type: "customize.updated" });
  }
  const customize = { appearance, mcp, extensions };
  const catalog = new CatalogService({
    dataDir: deps.dataDir,
    approvals,
    extensions,
    apps: appService,
    hub: deps.hub,
    fetch: deps.fetch,
  });
  const devices = new DeviceService({ db: deps.db, owner });
  const agentSetup = new AgentSetupService({
    dataDir: deps.dataDir,
    mcp,
    secrets,
    agents: deps.agents,
    engines: deps.engines,
    engineStatus: deps.engineStatus,
    runs,
    repo,
  });
  const scratchDir = join(deps.dataDir, "state", "scratch");
  const summaries = new ChatSummaryService({
    db: deps.db,
    repo,
    runs,
    engines: deps.engines,
    agents: deps.agents,
    projects,
    ownerName: owner.name,
    scratchDir,
    enabled: deps.summaries ?? (() => true),
  });
  registerExecutors(toolDeps);
  const runtime = new AgentRuntime({
    language: () => localization.agentLanguage(),
    chat,
    repo,
    runs,
    hub: deps.hub,
    engines: deps.engines,
    agents: deps.agents,
    projects,
    appTools: async (ctx) => [
      ...toolsFor(toolDeps, ctx),
      // In an app's chat, agents use the app through its actions (phase 25) and can look at it.
      ...(ctx.chat.projectId && appService.isApp(ctx.chat.projectId)
        ? [
            ...(await appActions.tools(ctx.chat.projectId, {
              handle: ctx.handle,
              chatId: ctx.chat.id,
              topicId: ctx.topicId,
            })),
            snapshotTool(appSnapshots, ctx.chat.projectId),
            libraryTool(projects.workspaceOf(ctx.chat.projectId), deps.fetch),
          ]
        : []),
      ...(ctx.handle === "orchestrator"
        ? [
            ...agentSetupTools(agentSetup),
            ...helpTools(),
            ...localizationTools(localization),
            ...restorePointTools(restorePoints, approvals, {
              handle: ctx.handle,
              chatId: ctx.chat.id,
              topicId: ctx.topicId,
            }),
          ]
        : []),
      // Every chat: a card lands where the user asked (alpha feedback: in a project chat the
      // orchestrator had no such tools and claimed to have sent cards).
      ...(ctx.handle === "orchestrator"
        ? [
            ...shellTools(layout),
            ...appTools(approvals, {
              handle: ctx.handle,
              chatId: ctx.chat.id,
              topicId: ctx.topicId,
            }),
            ...barTools(
              { apps: appService, appearance, chat },
              { handle: ctx.handle, depth: ctx.depth },
            ),
            ...customizeTools(customize, {
              handle: ctx.handle,
              chatId: ctx.chat.id,
              topicId: ctx.topicId,
            }),
            ...catalogTools(catalog, {
              handle: ctx.handle,
              chatId: ctx.chat.id,
              topicId: ctx.topicId,
            }),
          ]
        : []),
    ],
    mcpServers: (handle) => mcp.forAgent(handle),
    promptExtras: (profile) => [
      {
        source: "skills",
        title: "Its skills",
        text: skills.promptFor(profile),
      },
      {
        source: "guide",
        title: "How Aura works (the orchestrator only)",
        text: profile.handle === "orchestrator" ? AURA_GUIDE : "",
      },
    ],
    memoryPrompt: (input) => memory.promptFor(input),
    sandboxPolicy: () => sandbox.policy(),
    // Variables its command tool servers share first; the agent's own win on a clash.
    agentEnv: (profile) =>
      resolveEnv(
        { ...agentSetup.sharedEnvFor(profile.handle).env, ...(profile.env ?? {}) },
        { secret: (n) => secrets.get(n), env: process.env },
      ),
    redact: (text) => redact(text, [...secrets.values(), ...appSecrets.values()]),
    chatSummary: (chatId, topicId) => summaries.get(chatId, topicId),
    afterRun: (chat, topicId) => summaries.schedule(chat.id, topicId),
    appRun: (project, run) => appService.afterRun(project, run),
    ownerName: owner.name,
    scratchDir,
    files,
    maxChainDepth: deps.maxChainDepth,
  });
  const lastOwnMessage = (await repo.listMessages("direct", { limit: 50 }))
    .filter((m) => m.author.kind === "user")
    .at(-1);
  if (lastOwnMessage) runtime.primeLanguage(lastOwnMessage.body);
  return {
    repo,
    chat,
    owner,
    runs,
    projects,
    runtime,
    approvals,
    skills,
    tasks,
    jobs,
    alerts,
    toolDeps,
    memory,
    summaries,
    sandbox,
    secrets,
    appSecrets,
    files,
    appSnapshots,
    agentSetup,
    appearance,
    mcp,
    extensions,
    extensionBridge,
    apps: appService,
    appData,
    appActions,
    lifecycle,
    restorePoints,
    localization,
    layout,
    catalog,
    safeMode,
    appVersion: SERVER_VERSION,
    devices,
  };
}

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Surreal } from "surrealdb";
import { SERVER_VERSION } from "./config";
import { openAppDatabase } from "./db/client";
import { commitAll, ensureRepo } from "./lib/git";
import type { EngineSelector } from "./modules/ai/engines/registry";
import { AppActions } from "./modules/apps/apps/actions";
import { AppDataService } from "./modules/apps/apps/data";
import { AppLifecycle } from "./modules/apps/apps/lifecycle";
import { AppSecrets } from "./modules/apps/apps/secrets";
import { AppService } from "./modules/apps/apps/service";
import { AppSnapshots } from "./modules/apps/apps/snapshots";
import { appTools, barTools, libraryTool, snapshotTool } from "./modules/apps/apps/tools";
import { AppearanceService } from "./modules/apps/customize/appearance";
import { ExtensionBridge } from "./modules/apps/customize/bridge";
import { ExtensionService } from "./modules/apps/customize/extensions";
import type { SafeMode } from "./modules/apps/customize/safe-mode";
import { customizeTools } from "./modules/apps/customize/tools";
import { ChatRepo } from "./modules/chats/chat/repo";
import { ChatService } from "./modules/chats/chat/service";
import { FileStore } from "./modules/chats/files/store";
import { ProjectService } from "./modules/chats/projects/service";
import type { AgentDirectory } from "./modules/helpers/agents/directory";
import { redact } from "./modules/helpers/agents/env";
import { RunRepo } from "./modules/helpers/agents/runs";
import { AgentRuntime } from "./modules/helpers/agents/runtime";
import { toolsFor } from "./modules/helpers/agents/tools";
import { SandboxService } from "./modules/helpers/sandbox/service";
import { ApprovalService } from "./modules/system/approvals/service";
import { AURA_GUIDE, helpTools } from "./modules/system/help/tools";
import { LocalizationService } from "./modules/system/localization/service";
import { localizationTools } from "./modules/system/localization/tools";
import type { EventHub } from "./modules/system/realtime/hub";
import { LayoutService } from "./modules/system/shell/service";
import { shellTools } from "./modules/system/shell/tools";

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
  /** OS sandbox for agents' shell commands; created from the data dir when absent. */
  sandbox?: SandboxService;
  /** Network for packs installed from a URL (replaced in tests). */
  fetch?: typeof fetch;
  agents: AgentDirectory;
  dataDir: string;
  maxChainDepth?: number;
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
  const files = new FileStore(deps.dataDir);
  const toolDeps = {
    files,
    agents: deps.agents,
    projects,
    approvals,
    repo,
    chat,
    dataDir: deps.dataDir,
  };
  const appearance = new AppearanceService({
    db: deps.db,
    dataDir: deps.dataDir,
    approvals,
    hub: deps.hub,
  });
  await appearance.ensureDefaultTheme();
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
  });
  const layout = new LayoutService({ db: deps.db, hub: deps.hub, extensions });
  const localization = new LocalizationService({
    db: deps.db,
    dataDir: deps.dataDir,
    hub: deps.hub,
  });
  // Panel extensions become apps with a chat (ADR 0039), once.
  if (appService.legacyExtensions().length > 0) {
    const moved = await appService.adoptExtensions();
    if (moved.length > 0) deps.hub.publish({ type: "customize.updated" });
  }
  const customize = { appearance, extensions };
  const scratchDir = join(deps.dataDir, "state", "scratch");
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
            })),
            snapshotTool(appSnapshots, ctx.chat.projectId),
            libraryTool(projects.workspaceOf(ctx.chat.projectId), deps.fetch),
          ]
        : []),
      ...(ctx.handle === "orchestrator"
        ? [...helpTools(), ...localizationTools(localization)]
        : []),
      // Every chat: a card lands where the user asked (alpha feedback: in a project chat the
      // orchestrator had no such tools and claimed to have sent cards).
      ...(ctx.handle === "orchestrator"
        ? [
            ...shellTools(layout),
            ...appTools(approvals, {
              handle: ctx.handle,
              chatId: ctx.chat.id,
            }),
            ...barTools(
              { apps: appService, appearance, chat },
              { handle: ctx.handle, depth: ctx.depth },
            ),
            ...customizeTools(customize, {
              handle: ctx.handle,
              chatId: ctx.chat.id,
            }),
          ]
        : []),
    ],
    promptExtras: (profile) => [
      {
        source: "guide",
        title: "How Aura works (the orchestrator only)",
        text: profile.handle === "orchestrator" ? AURA_GUIDE : "",
      },
    ],
    sandboxPolicy: () => sandbox.policy(),
    redact: (text) => redact(text, appSecrets.values()),
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
    toolDeps,
    sandbox,
    appSecrets,
    files,
    appSnapshots,
    appearance,
    extensions,
    extensionBridge,
    apps: appService,
    appData,
    appActions,
    lifecycle,
    localization,
    layout,
    safeMode,
    appVersion: SERVER_VERSION,
  };
}

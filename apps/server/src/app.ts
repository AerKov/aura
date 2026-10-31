import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { enginesModule } from "./modules/ai/engines";
import type { EngineRegistry } from "./modules/ai/engines/registry";
import { localAiModule } from "./modules/ai/localai";
import { appsModule } from "./modules/apps/apps";
import type { AppActions } from "./modules/apps/apps/actions";
import type { AppDataService } from "./modules/apps/apps/data";
import type { AppLifecycle } from "./modules/apps/apps/lifecycle";
import type { AppSecrets } from "./modules/apps/apps/secrets";
import type { AppService } from "./modules/apps/apps/service";
import type { AppSnapshots } from "./modules/apps/apps/snapshots";
import { customizeModule } from "./modules/apps/customize";
import type { AppearanceService } from "./modules/apps/customize/appearance";
import type { ExtensionBridge } from "./modules/apps/customize/bridge";
import type { ExtensionService } from "./modules/apps/customize/extensions";
import type { McpService } from "./modules/apps/customize/mcp";
import type { SafeMode } from "./modules/apps/customize/safe-mode";
import { opsModule } from "./modules/automations/alerts";
import type { AlertService } from "./modules/automations/alerts/service";
import type { JobService } from "./modules/automations/jobs/service";
import { chatModule } from "./modules/chats/chat";
import { groupsModule } from "./modules/chats/chat/groups";
import type { ChatRepo } from "./modules/chats/chat/repo";
import type { ChatService } from "./modules/chats/chat/service";
import { filesModule } from "./modules/chats/files";
import type { FileStore } from "./modules/chats/files/store";
import { projectsModule } from "./modules/chats/projects";
import type { ProjectService } from "./modules/chats/projects/service";
import { summariesModule } from "./modules/chats/summaries";
import type { ChatSummaryService } from "./modules/chats/summaries/service";
import type { TaskService } from "./modules/chats/tasks/service";
import { agentsModule } from "./modules/helpers/agents";
import type { AgentDirectory } from "./modules/helpers/agents/directory";
import type { AgentRuntime } from "./modules/helpers/agents/runtime";
import type { AgentSetupService } from "./modules/helpers/agents/setup";
import { agentSetupModule } from "./modules/helpers/agents/setup-routes";
import { memoryModule } from "./modules/helpers/memory";
import type { MemoryService } from "./modules/helpers/memory/service";
import { sandboxModule } from "./modules/helpers/sandbox";
import type { SandboxService } from "./modules/helpers/sandbox/service";
import type { SkillService } from "./modules/helpers/skills/service";
import { controlModule } from "./modules/system/approvals";
import type { ApprovalService } from "./modules/system/approvals/service";
import { authModule } from "./modules/system/auth";
import type { LocalSessions, SessionUser } from "./modules/system/auth/sessions";
import { restorePointsModule } from "./modules/system/backups";
import type { RestorePointService } from "./modules/system/backups/restore-points";
import { type HealthDeps, healthModule } from "./modules/system/health";
import { localizationModule } from "./modules/system/localization";
import type { LocalizationService } from "./modules/system/localization/service";
import { realtimeModule } from "./modules/system/realtime";
import type { EventHub } from "./modules/system/realtime/hub";
import { shellModule } from "./modules/system/shell";
import type { LayoutService } from "./modules/system/shell/service";

export interface AppDeps extends HealthDeps {
  corsOrigins: string[];
  sessions: LocalSessions;
  owner: SessionUser;
  hub: EventHub;
  chat: ChatService;
  extraHosts?: string[];
  engines: EngineRegistry;
  memory: MemoryService;
  summaries: ChatSummaryService;
  agentSetup: AgentSetupService;
  appSecrets: AppSecrets;
  files: FileStore;
  appSnapshots: AppSnapshots;
  sandbox: SandboxService;
  dataDir: string;
  runtime: AgentRuntime;
  projects: ProjectService;
  agents: AgentDirectory;
  approvals: ApprovalService;
  skills: SkillService;
  tasks: TaskService;
  repo: ChatRepo;
  alerts: AlertService;
  jobs: JobService;
  webhookToken: string;
  publicUrl: string;
  appearance: AppearanceService;
  extensions: ExtensionService;
  extensionBridge: ExtensionBridge;
  layout: LayoutService;
  apps: AppService;
  lifecycle: AppLifecycle;
  restorePoints: RestorePointService;
  localization: LocalizationService;
  appData: AppDataService;
  appActions: AppActions;
  mcp: McpService;
  safeMode: SafeMode;
  appVersion: string;
}

export function createApp(deps: AppDeps) {
  return new Elysia()
    .use(cors({ origin: deps.corsOrigins }))
    .use(authModule(deps))
    .use(healthModule(deps))
    .use(
      chatModule({
        ...deps,
        agentExists: async (handle) => (await deps.agents.get(handle)) !== null,
      }),
    )
    .use(
      groupsModule({
        sessions: deps.sessions,
        repo: deps.repo,
        hub: deps.hub,
        agentExists: async (handle) => (await deps.agents.get(handle)) !== null,
        busyIn: (chatId) => deps.runtime.busyIn(chatId),
        projectOf: (slug) => deps.projects.get(slug),
        archiveProject: (slug) => deps.projects.archive(slug),
        dropFiles: (chatId) => deps.files.removeScope({ kind: "chat", id: chatId }),
        createWithFolder: async (title, agents) =>
          (await deps.projects.createGroup(title, agents)).chat,
      }),
    )
    .use(filesModule(deps))
    .use(localAiModule(deps))
    .use(agentsModule(deps))
    .use(enginesModule(deps))
    .use(memoryModule(deps))
    .use(sandboxModule(deps))
    .use(summariesModule(deps))
    .use(
      agentSetupModule({
        sessions: deps.sessions,
        setup: deps.agentSetup,
        explainPrompt: (handle) => deps.runtime.explainPrompt(handle),
      }),
    )
    .use(projectsModule(deps))
    .use(controlModule(deps))
    .use(opsModule(deps))
    .use(customizeModule(deps))
    .use(shellModule(deps))
    .use(appsModule(deps))
    .use(restorePointsModule({ sessions: deps.sessions, points: deps.restorePoints }))
    .use(localizationModule(deps))
    .use(realtimeModule(deps));
}

/** API type consumed by the desktop client through Eden Treaty. */
export type App = ReturnType<typeof createApp>;

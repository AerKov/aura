import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { agentsModule } from "./modules/agents";
import type { AgentDirectory } from "./modules/agents/directory";
import type { AgentRuntime } from "./modules/agents/runtime";
import type { AgentSetupService } from "./modules/agents/setup";
import { agentSetupModule } from "./modules/agents/setup-routes";
import { opsModule } from "./modules/alerts";
import type { AlertService } from "./modules/alerts/service";
import { controlModule } from "./modules/approvals";
import type { ApprovalService } from "./modules/approvals/service";
import { appsModule } from "./modules/apps";
import type { AppActions } from "./modules/apps/actions";
import type { AppDataService } from "./modules/apps/data";
import type { AppLifecycle } from "./modules/apps/lifecycle";
import type { AppSecrets } from "./modules/apps/secrets";
import type { AppService } from "./modules/apps/service";
import type { AppSnapshots } from "./modules/apps/snapshots";
import { authModule } from "./modules/auth";
import type { LocalSessions, SessionUser } from "./modules/auth/sessions";
import { restorePointsModule } from "./modules/backups";
import type { RestorePointService } from "./modules/backups/restore-points";
import { catalogModule } from "./modules/catalog";
import type { CatalogService } from "./modules/catalog/service";
import { chatModule } from "./modules/chat";
import type { ChatRepo } from "./modules/chat/repo";
import type { ChatService } from "./modules/chat/service";
import { modulesModule } from "./modules/core";
import type { ModuleService } from "./modules/core/modules";
import { customizeModule } from "./modules/customize";
import type { AppearanceService } from "./modules/customize/appearance";
import type { ExtensionBridge } from "./modules/customize/bridge";
import type { ExtensionService } from "./modules/customize/extensions";
import type { McpService } from "./modules/customize/mcp";
import type { SafeMode } from "./modules/customize/safe-mode";
import { devicesModule } from "./modules/devices";
import type { DeviceService } from "./modules/devices/service";
import { enginesModule } from "./modules/engines";
import type { EngineRegistry } from "./modules/engines/registry";
import type { ToolBridge } from "./modules/engines/tool-bridge";
import { type HealthDeps, healthModule } from "./modules/health";
import type { JobService } from "./modules/jobs/service";
import { localizationModule } from "./modules/localization";
import type { LocalizationService } from "./modules/localization/service";
import { memoryModule } from "./modules/memory";
import type { MemoryService } from "./modules/memory/service";
import { projectsModule } from "./modules/projects";
import type { ProjectService } from "./modules/projects/service";
import { realtimeModule } from "./modules/realtime";
import type { EventHub } from "./modules/realtime/hub";
import { sandboxModule } from "./modules/sandbox";
import type { SandboxService } from "./modules/sandbox/service";
import { shellModule } from "./modules/shell";
import type { LayoutService } from "./modules/shell/service";
import type { SkillService } from "./modules/skills/service";
import { summariesModule } from "./modules/summaries";
import type { ChatSummaryService } from "./modules/summaries/service";
import type { TaskService } from "./modules/tasks/service";

export interface AppDeps extends HealthDeps {
  corsOrigins: string[];
  sessions: LocalSessions;
  owner: SessionUser;
  hub: EventHub;
  chat: ChatService;
  extraHosts?: string[];
  engines: EngineRegistry;
  toolBridge: ToolBridge;
  memory: MemoryService;
  catalog: CatalogService;
  summaries: ChatSummaryService;
  agentSetup: AgentSetupService;
  appSecrets: AppSecrets;
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
  modules: ModuleService;
  appVersion: string;
  devices: DeviceService;
  pushPublicKey: string | null;
  webDir: string | null;
  lanUrls: string[];
  remote?: boolean;
}

export function createApp(deps: AppDeps) {
  return new Elysia()
    .use(cors({ origin: deps.corsOrigins }))
    .use(authModule(deps))
    .use(modulesModule(deps))
    .use(healthModule(deps))
    .use(chatModule(deps))
    .use(agentsModule(deps))
    .use(enginesModule(deps))
    .use(memoryModule(deps))
    .use(sandboxModule(deps))
    .use(catalogModule(deps))
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
    .use(devicesModule(deps))
    .use(realtimeModule(deps));
}

/** API type consumed by the desktop client through Eden Treaty. */
export type App = ReturnType<typeof createApp>;

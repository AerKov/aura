import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { enginesModule } from "./modules/ai/engines";
import type { EngineRegistry } from "./modules/ai/engines/registry";
import type { ToolBridge } from "./modules/ai/engines/tool-bridge";
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
import type { SafeMode } from "./modules/apps/customize/safe-mode";
import { chatModule } from "./modules/chats/chat";
import type { ChatRepo } from "./modules/chats/chat/repo";
import type { ChatService } from "./modules/chats/chat/service";
import { filesModule } from "./modules/chats/files";
import type { FileStore } from "./modules/chats/files/store";
import { projectsModule } from "./modules/chats/projects";
import type { ProjectService } from "./modules/chats/projects/service";
import { agentsModule } from "./modules/helpers/agents";
import type { AgentDirectory } from "./modules/helpers/agents/directory";
import type { AgentRuntime } from "./modules/helpers/agents/runtime";
import type { SandboxService } from "./modules/helpers/sandbox/service";
import { controlModule } from "./modules/system/approvals";
import type { ApprovalService } from "./modules/system/approvals/service";
import { authModule } from "./modules/system/auth";
import type { LocalSessions, SessionUser } from "./modules/system/auth/sessions";
import { type HealthDeps, healthModule } from "./modules/system/health";
import { localizationModule } from "./modules/system/localization";
import type { LocalizationService } from "./modules/system/localization/service";
import { realtimeModule } from "./modules/system/realtime";
import type { EventHub } from "./modules/system/realtime/hub";

export interface AppDeps extends HealthDeps {
  corsOrigins: string[];
  sessions: LocalSessions;
  owner: SessionUser;
  hub: EventHub;
  chat: ChatService;
  extraHosts?: string[];
  engines: EngineRegistry;
  toolBridge: ToolBridge;
  appSecrets: AppSecrets;
  files: FileStore;
  appSnapshots: AppSnapshots;
  sandbox: SandboxService;
  dataDir: string;
  runtime: AgentRuntime;
  projects: ProjectService;
  agents: AgentDirectory;
  approvals: ApprovalService;
  repo: ChatRepo;
  appearance: AppearanceService;
  extensions: ExtensionService;
  extensionBridge: ExtensionBridge;
  apps: AppService;
  lifecycle: AppLifecycle;
  localization: LocalizationService;
  appData: AppDataService;
  appActions: AppActions;
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
    .use(filesModule(deps))
    .use(localAiModule(deps))
    .use(agentsModule(deps))
    .use(enginesModule(deps))
    .use(projectsModule(deps))
    .use(controlModule(deps))
    .use(customizeModule(deps))
    .use(appsModule(deps))
    .use(localizationModule(deps))
    .use(realtimeModule(deps));
}

/** API type consumed by the desktop client through Eden Treaty. */
export type App = ReturnType<typeof createApp>;

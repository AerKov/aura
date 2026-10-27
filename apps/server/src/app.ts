import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { agentsModule } from "./modules/agents";
import type { AgentDirectory } from "./modules/agents/directory";
import type { AgentRuntime } from "./modules/agents/runtime";
import { opsModule } from "./modules/alerts";
import type { AlertService } from "./modules/alerts/service";
import { controlModule } from "./modules/approvals";
import type { ApprovalService } from "./modules/approvals/service";
import { authModule } from "./modules/auth";
import type { LocalSessions, SessionUser } from "./modules/auth/sessions";
import { catalogModule } from "./modules/catalog";
import type { CatalogService } from "./modules/catalog/service";
import { chatModule } from "./modules/chat";
import type { ChatRepo } from "./modules/chat/repo";
import type { ChatService } from "./modules/chat/service";
import { containersModule } from "./modules/containers";
import type { ContainerService } from "./modules/containers/service";
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
import { integrationsModule } from "./modules/integrations";
import type { IntegrationsService } from "./modules/integrations/service";
import type { JobService } from "./modules/jobs/service";
import { memoryModule } from "./modules/memory";
import type { MemoryService } from "./modules/memory/service";
import { projectsModule } from "./modules/projects";
import type { ProjectService } from "./modules/projects/service";
import { realtimeModule } from "./modules/realtime";
import type { EventHub } from "./modules/realtime/hub";
import { sandboxModule } from "./modules/sandbox";
import type { SandboxService } from "./modules/sandbox/service";
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
  containers: ContainerService;
  integrations: IntegrationsService;
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
  mcp: McpService;
  safeMode: SafeMode;
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
    .use(healthModule(deps))
    .use(chatModule(deps))
    .use(agentsModule(deps))
    .use(enginesModule(deps))
    .use(memoryModule(deps))
    .use(sandboxModule(deps))
    .use(catalogModule(deps))
    .use(summariesModule(deps))
    .use(containersModule(deps))
    .use(integrationsModule(deps))
    .use(projectsModule(deps))
    .use(controlModule(deps))
    .use(opsModule(deps))
    .use(customizeModule(deps))
    .use(devicesModule(deps))
    .use(realtimeModule(deps));
}

/** API type consumed by the desktop client through Eden Treaty. */
export type App = ReturnType<typeof createApp>;

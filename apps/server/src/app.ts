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
import { chatModule } from "./modules/chat";
import type { ChatRepo } from "./modules/chat/repo";
import type { ChatService } from "./modules/chat/service";
import { customizeModule } from "./modules/customize";
import type { AppearanceService } from "./modules/customize/appearance";
import type { ExtensionService } from "./modules/customize/extensions";
import type { McpService } from "./modules/customize/mcp";
import type { SafeMode } from "./modules/customize/safe-mode";
import { type HealthDeps, healthModule } from "./modules/health";
import type { JobService } from "./modules/jobs/service";
import { projectsModule } from "./modules/projects";
import type { ProjectService } from "./modules/projects/service";
import { realtimeModule } from "./modules/realtime";
import type { EventHub } from "./modules/realtime/hub";
import type { SkillService } from "./modules/skills/service";
import type { TaskService } from "./modules/tasks/service";
import type { LLMProvider } from "./providers/types";

export interface AppDeps extends HealthDeps {
  corsOrigins: string[];
  sessions: LocalSessions;
  owner: SessionUser;
  hub: EventHub;
  chat: ChatService;
  extraHosts?: string[];
  provider: LLMProvider & { resetStatus?: () => void };
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
  mcp: McpService;
  safeMode: SafeMode;
  appVersion: string;
}

export function createApp(deps: AppDeps) {
  return new Elysia()
    .use(cors({ origin: deps.corsOrigins }))
    .use(authModule(deps))
    .use(healthModule(deps))
    .use(chatModule(deps))
    .use(agentsModule(deps))
    .use(projectsModule(deps))
    .use(controlModule(deps))
    .use(opsModule(deps))
    .use(customizeModule(deps))
    .use(realtimeModule(deps));
}

/** API type consumed by the desktop client through Eden Treaty. */
export type App = ReturnType<typeof createApp>;

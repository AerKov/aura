import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { agentsModule } from "./modules/agents";
import type { AgentDirectory } from "./modules/agents/directory";
import type { AgentRuntime } from "./modules/agents/runtime";
import { authModule } from "./modules/auth";
import type { LocalSessions, SessionUser } from "./modules/auth/sessions";
import { chatModule } from "./modules/chat";
import type { ChatService } from "./modules/chat/service";
import { type HealthDeps, healthModule } from "./modules/health";
import { projectsModule } from "./modules/projects";
import type { ProjectService } from "./modules/projects/service";
import { realtimeModule } from "./modules/realtime";
import type { EventHub } from "./modules/realtime/hub";
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
}

export function createApp(deps: AppDeps) {
  return new Elysia()
    .use(cors({ origin: deps.corsOrigins }))
    .use(authModule(deps))
    .use(healthModule(deps))
    .use(chatModule(deps))
    .use(agentsModule(deps))
    .use(projectsModule(deps))
    .use(realtimeModule(deps));
}

/** API type consumed by the desktop client through Eden Treaty. */
export type App = ReturnType<typeof createApp>;

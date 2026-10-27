import { Elysia } from "elysia";
import type { AgentDirectory } from "../agents/directory";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { ProjectService } from "./service";

export const projectsModule = (deps: {
  sessions: LocalSessions;
  projects: ProjectService;
  agents: AgentDirectory;
}) =>
  new Elysia({ name: "projects" })
    .use(authGuard(deps.sessions))
    .get(
      "/projects",
      async () =>
        // The workspace path stays on the server.
        (await deps.projects.list()).map(({ workspace: _workspace, ...project }) => project),
      { auth: true },
    )
    .get(
      "/agents",
      async () =>
        (await deps.agents.list()).map((a) => ({
          handle: a.handle,
          name: a.name,
          role: a.role,
          model: a.model,
          tools: a.builtinTools,
          budgetUsd: a.budgetUsd,
        })),
      { auth: true },
    );

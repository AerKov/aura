import { Elysia, t } from "elysia";
import { errorMessage } from "../../lib/log";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { ProjectError, type ProjectService } from "../projects/service";
import type { SandboxService } from "../sandbox/service";
import { ContainerError, type ContainerService } from "./service";

export interface ContainersDeps {
  sessions: LocalSessions;
  containers: ContainerService;
  projects: ProjectService;
  sandbox: SandboxService;
}

const params = t.Object({ projectId: t.String({ maxLength: 64 }) });

/** Project containers (ADR 0018): runtime status, and where each project's commands run. */
export const containersModule = ({ sessions, containers, projects, sandbox }: ContainersDeps) =>
  new Elysia({ name: "containers" })
    .use(authGuard(sessions))
    .get(
      "/containers",
      async () => ({
        runtime: await containers.runtimeStatus(),
        settings: sandbox.store.get().container,
      }),
      { auth: true },
    )
    .get(
      "/projects/:projectId/container",
      async ({ params, status }) => {
        const project = await projects.get(params.projectId);
        if (!project) return status(404, { error: "No such project" });
        try {
          return {
            isolation: project.isolation,
            container: await containers.status(project),
            error: null,
          };
        } catch (error) {
          return { isolation: project.isolation, container: null, error: errorMessage(error) };
        }
      },
      { auth: true, params },
    )
    .put(
      "/projects/:projectId/isolation",
      async ({ params, body, status }) => {
        try {
          const { workspace: _workspace, ...project } = await projects.setIsolation(
            params.projectId,
            body.isolation,
          );
          return project;
        } catch (error) {
          if (error instanceof ProjectError) return status(404, { error: error.message });
          throw error;
        }
      },
      { auth: true, params, body: t.Object({ isolation: t.UnionEnum(["host", "container"]) }) },
    )
    .post(
      "/projects/:projectId/container/reset",
      async ({ params, status }) => {
        if (!(await projects.get(params.projectId)))
          return status(404, { error: "No such project" });
        try {
          await containers.remove(params.projectId);
          return { ok: true };
        } catch (error) {
          if (error instanceof ContainerError) return status(409, { error: error.message });
          throw error;
        }
      },
      { auth: true, params },
    );

import { Elysia, t } from "elysia";
import { authGuard } from "../../system/auth";
import type { LocalSessions } from "../../system/auth/sessions";
import type { EventHub } from "../../system/realtime/hub";
import { type ChatRepo, ORCHESTRATOR, OWNER_ID } from "./repo";

const HANDLE = t.String({ pattern: "^[a-z][a-z0-9-_]{1,31}$" });
const MAX_TITLE = 60;

export interface GroupsDeps {
  sessions: LocalSessions;
  repo: ChatRepo;
  hub: EventHub;
  agentExists: (handle: string) => Promise<boolean>;
  /** Whether a helper is working in the chat. */
  busyIn: (chatId: string) => boolean;
  /** The project behind a chat, if it has one: its kind decides how the chat can go. */
  projectOf: (slug: string) => Promise<{ kind: "project" | "app" } | null>;
  /** Removes a project's record and moves its files to the backups folder. */
  archiveProject: (slug: string) => Promise<string>;
  /** Drops the files attached in the chat. */
  dropFiles: (chatId: string) => void;
}

/**
 * Groups the user makes and chats the user deletes (ADR 0035). A group is a plain group chat: a
 * name and the helpers in it, no project or folder behind it. A project's chat can be deleted too
 * (its files are kept in `backups/projects`); an app's chat goes with the app, from "My apps".
 */
export const groupsModule = (deps: GroupsDeps) =>
  new Elysia({ name: "chat-groups" })
    .use(authGuard(deps.sessions))
    .post(
      "/chats",
      async ({ body, status }) => {
        const title = body.title.trim();
        if (!title) return status(400, { error: "Give the group a name" });
        const handles = [...new Set(body.agents ?? [])].filter((h) => h !== ORCHESTRATOR.id);
        for (const handle of handles)
          if (!(await deps.agentExists(handle)))
            return status(404, { error: `No helper @${handle}` });
        return deps.repo.createChat({
          kind: "group",
          title,
          members: [
            { participant: { kind: "user", id: OWNER_ID }, role: "owner" },
            { participant: ORCHESTRATOR, role: "member" },
            ...handles.map((id) => ({
              participant: { kind: "agent" as const, id },
              role: "member" as const,
            })),
          ],
        });
      },
      {
        auth: true,
        body: t.Object({
          title: t.String({ maxLength: MAX_TITLE }),
          agents: t.Optional(t.Array(HANDLE, { maxItems: 20 })),
        }),
      },
    )
    .delete(
      "/chats/:chatId",
      async ({ params, status }) => {
        const found = await deps.repo.findChat(params.chatId);
        if (!found) return status(404, { error: "Chat not found" });
        if (found.kind !== "group")
          return status(400, { error: "Your chat with the Helper and the alerts stay" });
        if (deps.busyIn(found.id))
          return status(409, { error: "A helper is working here. Stop it first." });
        if (found.projectId) {
          const project = await deps.projectOf(found.projectId);
          if (project?.kind === "app")
            return status(400, { error: "An app's chat goes with the app: uninstall the app" });
          if (project) await deps.archiveProject(found.projectId);
        }
        await deps.repo.removeChat(found.id);
        deps.dropFiles(found.id);
        deps.hub.publish({ type: "chat.removed", chatId: found.id });
        return { ok: true };
      },
      { auth: true, params: t.Object({ chatId: t.String() }) },
    );

import { Elysia, t } from "elysia";
import { errorMessage } from "../../lib/log";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { MemoryService } from "./service";

export interface MemoryDeps {
  sessions: LocalSessions;
  memory: MemoryService;
}

/** Agent memory for the user (ADR 0013): see what agents remember, search, delete, reindex. */
export const memoryModule = ({ sessions, memory }: MemoryDeps) =>
  new Elysia({ name: "memory" })
    .use(authGuard(sessions))
    .get(
      "/memory",
      ({ query }) =>
        memory.list({
          owner:
            query.scope && query.owner ? { scope: query.scope, owner: query.owner } : undefined,
          query: query.q,
        }),
      {
        auth: true,
        query: t.Object({
          q: t.Optional(t.String({ maxLength: 500 })),
          scope: t.Optional(t.UnionEnum(["agent", "project"])),
          owner: t.Optional(t.String({ maxLength: 100 })),
        }),
      },
    )
    .delete(
      "/memory/:id",
      async ({ params, status }) =>
        (await memory.delete(params.id))
          ? { deleted: true }
          : status(404, { error: "No such note" }),
      { auth: true },
    )
    .post(
      "/memory/reindex",
      async ({ status }) => {
        try {
          return await memory.reindex();
        } catch (error) {
          return status(502, { error: errorMessage(error) });
        }
      },
      { auth: true },
    );

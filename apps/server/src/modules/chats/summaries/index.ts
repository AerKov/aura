import { Elysia, t } from "elysia";
import { authGuard } from "../../system/auth";
import type { LocalSessions } from "../../system/auth/sessions";
import type { ChatSummaryService } from "./service";

export interface SummariesDeps {
  sessions: LocalSessions;
  summaries: ChatSummaryService;
}

const params = t.Object({ chatId: t.String({ maxLength: 64 }) });
/** A topic id; absent for the chat's General topic. */
const topicQuery = t.Object({ topic: t.Optional(t.String({ maxLength: 64 })) });

/** What agents keep of a chat's older messages (ADR 0017): read it, or make them forget it. */
export const summariesModule = ({ sessions, summaries }: SummariesDeps) =>
  new Elysia({ name: "summaries" })
    .use(authGuard(sessions))
    .get(
      "/chats/:chatId/summary",
      async ({ params, query }) => ({
        summary: await summaries.get(params.chatId, query.topic ?? null),
      }),
      { auth: true, params, query: topicQuery },
    )
    .delete(
      "/chats/:chatId/summary",
      async ({ params, query }) => {
        await summaries.clear(params.chatId, query.topic ?? null);
        return { ok: true };
      },
      { auth: true, params, query: topicQuery },
    );

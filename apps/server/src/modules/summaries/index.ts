import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import type { ChatSummaryService } from "./service";

export interface SummariesDeps {
  sessions: LocalSessions;
  summaries: ChatSummaryService;
}

const params = t.Object({ chatId: t.String({ maxLength: 64 }) });

/** What agents keep of a chat's older messages (ADR 0017): read it, or make them forget it. */
export const summariesModule = ({ sessions, summaries }: SummariesDeps) =>
  new Elysia({ name: "summaries" })
    .use(authGuard(sessions))
    .get(
      "/chats/:chatId/summary",
      async ({ params }) => ({ summary: await summaries.get(params.chatId) }),
      { auth: true, params },
    )
    .delete(
      "/chats/:chatId/summary",
      async ({ params }) => {
        await summaries.clear(params.chatId);
        return { ok: true };
      },
      { auth: true, params },
    );

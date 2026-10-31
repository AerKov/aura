import { Elysia, t } from "elysia";
import { authGuard } from "../auth";
import type { LocalSessions } from "../auth/sessions";
import { type ApprovalService, toCard } from "./service";

export interface ControlDeps {
  sessions: LocalSessions;
  approvals: ApprovalService;
}

/** The user's decisions on what agents ask to do (approvals, ADR 0006). */
export const controlModule = ({ sessions, approvals }: ControlDeps) =>
  new Elysia({ name: "control" })
    .use(authGuard(sessions))
    .get("/approvals", async () => (await approvals.listPending()).map(toCard), { auth: true })
    .post(
      "/approvals/:approvalId/decide",
      async ({ params, body, user }) =>
        toCard(await approvals.decide(params.approvalId, body.approve, user.id)),
      { auth: true, body: t.Object({ approve: t.Boolean() }) },
    );

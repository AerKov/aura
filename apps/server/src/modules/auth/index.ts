import type { LocalSession } from "@crew/shared";
import { Elysia } from "elysia";
import { bearerToken, isLoopbackHost, type LocalSessions, type SessionUser } from "./sessions";

export interface AuthDeps {
  sessions: LocalSessions;
  owner: SessionUser;
  corsOrigins: string[];
  /** Extra Host names to accept besides loopback (tests use Eden's in-process host). */
  extraHosts?: string[];
}

/** Adds the `auth: true` route option, which resolves `user` or answers 401. */
export const authGuard = (sessions: LocalSessions) =>
  new Elysia({ name: "auth-guard" }).macro({
    auth: {
      resolve({ headers, status }) {
        const user = sessions.verify(bearerToken(headers.authorization));
        if (!user) return status(401, "Unauthorized");
        return { user };
      },
    },
  });

export const authModule = ({ sessions, owner, corsOrigins, extraHosts = [] }: AuthDeps) =>
  new Elysia({ name: "auth" })
    // Loopback-only Host header for every request (DNS-rebinding protection).
    .onRequest(({ request, status }) => {
      if (!isLoopbackHost(request.headers.get("host") ?? new URL(request.url).host, extraHosts))
        return status(403, "Forbidden host");
    })
    .post(
      "/session/local",
      ({ request, status }) => {
        // Only the desktop app (an allowed browser origin) may obtain a session; websites cannot
        // forge Origin. See docs/decisions/0003-local-session.md.
        const origin = request.headers.get("origin");
        if (!origin || !corsOrigins.includes(origin)) return status(403, "Origin not allowed");
        const session: LocalSession = { token: sessions.issue(owner), user: owner };
        return session;
      },
      { detail: { summary: "Automatic session for the local owner" } },
    );

import type { LocalSession } from "@aura/shared";
import { Elysia } from "elysia";
import { bearerToken, isLoopbackHost, type LocalSessions, type SessionUser } from "./sessions";

export interface AuthDeps {
  sessions: LocalSessions;
  owner: SessionUser;
  corsOrigins: string[];
  /** Extra Host names to accept besides loopback (tests use Eden's in-process host). */
  extraHosts?: string[];
}

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Adds the `auth: true` route option, which resolves `user` or answers 401. */
export const authGuard = (sessions: LocalSessions) =>
  new Elysia({ name: "auth-guard" }).macro({
    auth: {
      async resolve({ headers, status }) {
        const user = await sessions.authenticate(bearerToken(headers.authorization));
        if (!user) return status(401, "Unauthorized");
        return { user };
      },
    },
  });

export const authModule = ({ sessions, owner, corsOrigins, extraHosts = [] }: AuthDeps) =>
  new Elysia({ name: "auth" })
    // Loopback-only Host header for every request (DNS-rebinding protection).
    .onRequest(({ request, status }) => {
      const path = new URL(request.url).pathname;
      // Webhooks authenticate with their own token and may arrive through a tunnel.
      if (path.startsWith("/hooks/alerts/")) return;
      if (!isLoopbackHost(request.headers.get("host") ?? new URL(request.url).host, extraHosts))
        return status(403, "Forbidden host");
    })
    .post(
      "/session/local",
      ({ request, server, status }) => {
        // Only the desktop app (an allowed browser origin on this machine) may obtain a session;
        // websites cannot forge Origin. See docs/decisions/0003-local-session.md.
        const peer = server?.requestIP(request)?.address;
        if (peer && !LOOPBACK_IPS.has(peer))
          return status(403, "Local sessions are only for this computer");
        const origin = request.headers.get("origin");
        if (!origin || !corsOrigins.includes(origin)) return status(403, "Origin not allowed");
        const session: LocalSession = { token: sessions.issue(owner), user: owner };
        return session;
      },
      { detail: { summary: "Automatic session for the local owner" } },
    );

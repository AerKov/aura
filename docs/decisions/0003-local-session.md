# 0003: Automatic local session instead of a login (v1)

- Status: accepted
- Date: 2026-10-26
- Phase: 1

## Context

v1 has one user per install and the server only listens on loopback. A login screen adds friction and
no security against the owner's own processes, which can read `~/.aura` anyway. What must be stopped are
**websites** in the user's browser talking to `127.0.0.1:4517` (CSRF, DNS rebinding).

## Decision

- The server creates a single owner user (`user:owner`) at startup.
- `POST /session/local` returns a random 256-bit bearer token for the owner, but only when the request
  carries an `Origin` from the allow-list (Tauri webview, Vite dev server). Browsers cannot forge `Origin`,
  so a website cannot obtain a token.
- Every request must have a loopback `Host` header (blocks DNS rebinding).
- All other routes require `Authorization: Bearer <token>`; the WebSocket takes `?token=`.
- Tokens live in memory. After a server restart the client gets 401 and silently requests a new session.
- Better Auth is **deferred** to Phase 7 (mobile thin client), where a real login over the network is
  needed. The `LocalSessions` boundary is small so it can be replaced then.

## Consequences

- No login UI in v1; the app opens straight into chats.
- Any local process of the same OS user can call the API (same trust level as reading `~/.aura`).

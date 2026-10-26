# 0002: Server and desktop wiring

- Status: accepted
- Date: 2026-10-26
- Phase: 0

## Decision

- The server listens on `127.0.0.1:4517` (`CREW_HOST`, `CREW_PORT`). The client reads
  `VITE_CREW_SERVER_URL`, defaulting to the same address. Loopback only until mobile (Phase 7).
- HTTP API types reach the client only through Eden Treaty: `apps/server` exports `type App`, the desktop
  app imports it as a type (`@crew/server` is a dev dependency) and calls `treaty<App>(url)`.
- One WebSocket at `/ws` for server-to-client events; its protocol lives in `packages/shared`.
- CORS allows the Vite dev origin and the Tauri webview origins; the Tauri CSP allows only the local server.
- **Dev:** `bun run dev` runs the server with `bun --watch` (data in `.crew-dev/`) and `tauri dev`
  separately. Debug builds of the shell do not spawn the sidecar.
- **Release:** `bun run build` compiles the server to `crew-server-<target-triple>`, and Tauri bundles it
  as an `externalBin` via `src-tauri/tauri.sidecar.conf.json` (merged only for builds, so `tauri dev`
  does not need a compiled sidecar). The shell spawns it on startup and kills it on exit.
- The shell passes `CREW_PARENT_PID`; the server exits when its parent is gone, so a crashed or killed
  shell never leaves an orphaned server holding the port and the DB.

## Open

- A fixed port can collide with another app. Later: pick a free port in the shell and pass it to both the
  server (env) and the webview (Tauri command), or fall back to the next port.
- Auth on the local API arrives with Better Auth in Phase 1.

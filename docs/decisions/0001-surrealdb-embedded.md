# 0001: Embedded SurrealDB in the server process

- Status: accepted
- Date: 2026-10-26
- Phase: 0

## Context

The spec (section 4) leaves open whether SurrealDB runs as a separate `surreal` sidecar binary or embedded
in the Bun server. Requirements: local-first, file storage, LIVE SELECT for realtime, vector search later,
and it must work inside the `bun build --compile` sidecar.

## Decision

Embed SurrealDB in the server using the official `@surrealdb/node` engine (native Node-API addon, works
under Bun) together with the `surrealdb` JS SDK. Storage engine: `surrealkv://` (file based).

- Default location: `<AURA_DATA_DIR>/state/db` (`~/.aura/state/db`). `state/` will be git-ignored when the
  user data dir becomes a git repo (Phase 6). `AURA_DB_URL` overrides it, e.g. `mem://` in tests or a
  `ws://` URL for a standalone SurrealDB.
- Namespace `aura`, database `main`.
- `bun build --compile` cannot embed the addon (it is loaded by a dynamic `require`). The build script
  (`scripts/build-sidecar.ts`) copies the platform `.node` file into the Tauri bundle as a resource, and the
  Tauri shell passes its path in `NAPI_RS_NATIVE_LIBRARY_PATH`, which the napi-rs loader honours. When the
  variable is unset the server also looks for `surrealdb-node.*.node` next to its executable.

Verified: queries and LIVE SELECT work under `bun run` and in the compiled sidecar (engine 3.3.4).

## Consequences

- One process to manage instead of two; no ports or credentials for the DB.
- The DB lives and dies with the server; only the server can access it (fine for single-user v1).
- The bundle carries a ~50 MB native addon per platform; builds are per-platform anyway (Tauri).
- LIVE SELECT requires the table to be defined first (`DEFINE TABLE`), so schemas must be applied at
  startup before subscribing.
- The SDK supports remote engines too, so switching to a sidecar `surreal` binary later only changes
  `AURA_DB_URL` and process management, not feature code.

## Alternatives

- **Sidecar `surreal` binary**: extra process, port and root credentials to manage; larger download.
- **SurrealDB WASM engine**: aimed at browsers; slower and less suited to file storage under Bun.

# aura

A local-first desktop messenger where you work with an AI orchestrator and a team of AI agents.
Working name; see [docs/SPEC.md](docs/SPEC.md) for the product and architecture spec.

Status: **Phase 0 (scaffold)**.

## Requirements

- [Bun](https://bun.sh) 1.4+
- Rust toolchain and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

## Development

```sh
bun install
bun run dev            # server (watch) + desktop app
bun run dev:server     # server only, http://127.0.0.1:4517
bun run dev:desktop    # desktop only (expects a running server)

bun run typecheck
bun run lint           # biome; `bun run lint:fix` to apply fixes
bun test

bun run build          # compile the server sidecar, then `tauri build`
```

Dev data (SurrealDB files) goes to `.aura-dev/`. A release build stores data in `~/.aura`
(override with `AURA_DATA_DIR`).

## Layout

```
apps/server     Bun + Elysia API, WebSocket, embedded SurrealDB
apps/desktop    Tauri 2 shell + React/Vite/Tailwind/shadcn UI
packages/shared Protocol and types shared by server and client
docs/           Spec and architecture decisions (docs/decisions)
```

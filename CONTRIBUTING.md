# Contributing to Aura

Thanks for helping. Aura is a small, local-first project; these notes keep changes easy to review.

## Before you start

- Read [docs/SPEC.md](docs/SPEC.md) (product and architecture) and the
  [architecture decisions](docs/decisions/). Larger changes start with an issue or a short ADR.
- The [architecture rules](CLAUDE.md#architecture-rules-do-not-break-these) are not negotiable:
  local-first, approvals for side effects, external content is data, loop guards, never touch an agent
  app's login.

## Setup

You need [Bun](https://bun.sh) 1.4+, and for the desktop app a Rust toolchain plus the
[Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
bun install
bun run dev          # server (watch, data in .aura-dev/) + desktop app
```

Without Rust you can still work on the server and the web client:

```sh
bun run dev:server                      # http://127.0.0.1:4517
bun run --cwd apps/desktop dev:vite     # http://localhost:1420 in a browser
```

## Checks

Run all three before you open a pull request; CI runs the same:

```sh
bun run typecheck
bun run lint          # biome; `bun run lint:fix` applies fixes
bun test
```

Tests are required for the message protocol, loop guards (budgets, chain depth, permissions),
approvals, and anything that confines agents (paths, tools, permissions).

## Conventions

- Bun only (never npm, yarn or pnpm for this repo). Pin exact dependency versions and say in the
  pull request why a new dependency is needed.
- TypeScript `strict`, no `any`. Typed errors; never swallow them silently.
- API types reach the client through Eden Treaty; never hand-write them. The message protocol lives
  in `packages/shared`.
- English for code, comments, commits and docs.
  [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`,
  `refactor:`, `chore:`.
- One topic per pull request. Screenshots for UI changes.

## Documentation

User-facing docs live in [docs/wiki](docs/wiki/) and are published to the GitHub wiki on every
push to the default branch. Edit them in the repo, not in the wiki UI (changes there are overwritten).

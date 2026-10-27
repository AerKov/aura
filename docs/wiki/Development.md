# Development

## Requirements

- [Bun](https://bun.sh) 1.4+ (the only package manager used here)
- For the desktop app: Rust and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)

## Run

```sh
bun install
bun run dev                          # server (watch) + desktop app, dev data in .aura-dev/
bun run dev:server                   # server only: http://127.0.0.1:4517
bun run --cwd apps/desktop dev:vite  # UI in a browser at http://localhost:1420 (needs the server)
```

## Check

```sh
bun run typecheck
bun run lint        # biome check; lint:fix applies fixes
bun test
```

CI runs the same on every push, and compiles and smoke-tests the server sidecar.

## Build

```sh
bun run build       # compiles the server sidecar, then tauri build
```

Releases: pushing a tag like `v0.9.0` runs the Release workflow, which builds macOS, Windows and Linux
installers into a draft GitHub release.

## Server settings

| Variable                                           | Default              | Meaning                                  |
| -------------------------------------------------- | -------------------- | ---------------------------------------- |
| `AURA_DATA_DIR`                                    | `~/.aura`            | user data (git repo) and state           |
| `AURA_PORT` / `AURA_HOST`                          | `4517` / `127.0.0.1` | where the server listens                 |
| `AURA_REMOTE`                                      | off                  | listen on the LAN for paired phones      |
| `AURA_PUBLIC_URL`                                  | local URL            | base URL shown for webhooks (tunnels)    |
| `AURA_DEFAULT_MODEL`                               | `claude-opus-5-5`    | Claude model when none is chosen         |
| `AURA_CLAUDE_EXECUTABLE`, `AURA_<NAME>_EXECUTABLE` | found on PATH        | agent app locations                      |
| `AURA_SAFE_MODE`                                   | off                  | start without MCP servers and extensions |
| `AURA_DB_URL`                                      | file in `state/`     | SurrealDB URL (`mem://` for tests)       |

## Contributing

See [CONTRIBUTING.md](https://github.com/AerKov/aura/blob/HEAD/CONTRIBUTING.md). Start with the
[architecture](Architecture) page and the architecture rules in
[CLAUDE.md](https://github.com/AerKov/aura/blob/HEAD/CLAUDE.md).

# aura

A local-first desktop messenger where you work with an AI orchestrator and a team of AI agents.
Working name; see [docs/SPEC.md](docs/SPEC.md) for the product and architecture spec.

Status: **proof of concept**, roadmap phases 0-9 implemented (see `docs/SPEC.md` and `docs/decisions/`).

## Requirements

- [Bun](https://bun.sh) 1.4+
- Rust toolchain and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

## Choose what runs your agents

Open **Engines** in the left rail. Any one of these is enough:

| Engine                       | What you need                                                                                                                                                          | Cost                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Claude Code                  | `npm i -g @anthropic-ai/claude-code`, then run `claude` and log in                                                                                                     | Claude plan or API    |
| Gemini CLI                   | `npm i -g @google/gemini-cli`, then run `gemini` and sign in with Google                                                                                               | free tier             |
| Codex                        | `npm i -g @openai/codex @zed-industries/codex-acp`, then `codex login`                                                                                                 | ChatGPT plan or API   |
| OpenCode                     | `npm i -g opencode-ai`, then `opencode auth login`                                                                                                                     | depends on provider   |
| Ollama                       | [ollama.com](https://ollama.com), `ollama pull qwen3:8b`, then start it with `OLLAMA_CONTEXT_LENGTH=32768 ollama serve` (agents need more than the default 4K context) | free, local           |
| OpenRouter                   | a key from openrouter.ai/keys, pasted in Engines; pick a `:free` model                                                                                                 | free models available |
| LM Studio / llama.cpp / vLLM | an OpenAI-compatible server URL                                                                                                                                        | free, local           |

Press **Use for all agents** on a ready engine, or choose an engine per agent at the bottom of the
page. Logins stay with each agent app; API keys you paste are kept in `~/.aura/state/secrets.json`
(outside git) and sent only to their own service. See ADR 0011 and 0012.

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

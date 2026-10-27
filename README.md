<p align="center">
  <img src="docs/assets/icon.png" width="96" height="96" alt="Aura">
</p>

<h1 align="center">Aura</h1>

<p align="center">
  <b>A messenger for you and your team of AI agents.</b><br>
  Local-first. Bring your own agent: Claude Code, Gemini CLI, Codex, OpenCode, or local models.
</p>

<p align="center">
  <a href="https://github.com/AerKov/aura/actions/workflows/ci.yml"><img src="https://github.com/AerKov/aura/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/status-proof%20of%20concept-orange" alt="Status: proof of concept">
  <a href="https://github.com/AerKov/aura/wiki"><img src="https://img.shields.io/badge/docs-wiki-0077dc" alt="Docs"></a>
</p>

<p align="center">
  <img src="docs/assets/project-light.png" alt="A project chat: a coder and a reviewer finish a CLI tool" width="900">
</p>

You talk to an **orchestrator**. It plans with you, puts together a team of **agents**, and they
work in project chats like people do: they write code and files, hand work to each other with
@mentions, review each other, handle monitoring alerts and improve their own skills. Anything that
matters waits for your **approval**.

Everything runs on your computer: chats in a local database, agents, skills and projects as plain
files in a git repository you own.

## Features

- **Everything is a chat.** Your orchestrator, one chat per project, and a chat for alerts. Replies
  like a messenger; no channels, threads or workspaces.
- **Agents as files.** Each agent has a role, tools (least privilege), a budget, skills and its own
  engine. Ask the orchestrator for a new one; approve it.
- **Projects that ship.** A project is a chat, a git folder and a budget. Agents take turns, every
  run is committed, every reply shows the tools used and the cost.
- **Choose the engine per agent.** Claude Code, Gemini CLI, Codex or OpenCode under your own login,
  or Aura's built-in agent on OpenRouter, Ollama or LM Studio, free options included.
- **Approvals for side effects.** New projects and agents, skill changes, schedules, CSS, MCP servers
  and extensions all show a card with exactly what will change.
- **Talk like in a messenger.** Type `@` to pick an agent, reply to a message to answer its author,
  or just write: the orchestrator passes it to the right agent.
- **Sandboxed shell.** Agents' commands write only in the project, cannot read your credentials, and
  reach only the hosts you allow. With Docker or Podman, a project can run them in its own
  container that sees nothing but the project folder.
- **Safe by default.** Agents stay inside their project folder, wake each other only by mention, stop at
  their budget and treat web pages, alerts and files as data, never as instructions.
- **Alerts and schedules.** Monitoring webhooks wake the orchestrator for triage; recurring jobs run
  agents on a schedule.
- **Memory.** Agents keep notes across runs (their own, and shared per project) and get the relevant
  ones every time; you can read and delete all of them. Long chats are summarized, so earlier
  decisions are not lost.
- **Skills that improve.** Agents propose changes to their own know-how; you approve the diff;
  every version is a git commit you can roll back.
- **Catalog.** Install a ready-made dev team, writers, researchers, on-call, themes or panels in one
  click, or a pack from a GitHub link; you see every file and diff first.
- **Customize by asking.** Themes, MCP tool servers and sandboxed panel extensions, built by the
  orchestrator in chat.
- **On your phone.** Pair a phone with a one-time code; it connects to your desktop, with
  notifications. No cloud.

<table>
  <tr>
    <td width="50%"><img src="docs/assets/engines.png" alt="Engines: choose what runs your agents"></td>
    <td width="50%"><img src="docs/assets/alerts-dark.png" alt="Alert triage in the dark theme; an injected instruction is flagged, not followed"></td>
  </tr>
  <tr>
    <td align="center"><sub>Pick an engine for all agents or per agent</sub></td>
    <td align="center"><sub>Alert triage: an injected instruction is flagged, not followed</sub></td>
  </tr>
</table>

<p align="center"><img src="docs/assets/phone.png" alt="Aura on a phone" width="600"></p>

## Get started

1. **Install.** Download a build from [Releases](https://github.com/AerKov/aura/releases), or run
   from source:

   ```sh
   git clone https://github.com/AerKov/aura && cd aura
   bun install
   bun run dev
   ```

   From source you need [Bun](https://bun.sh) 1.4+ and the
   [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

2. **Pick an engine** on the **Engines** page. Any one is enough:

   | Engine                                        | Setup                                                              | Cost                  |
   | --------------------------------------------- | ------------------------------------------------------------------ | --------------------- |
   | Claude Code                                   | `npm i -g @anthropic-ai/claude-code`, run `claude`, log in         | Claude plan or API    |
   | Gemini CLI                                    | `npm i -g @google/gemini-cli`, run `gemini`, sign in with Google   | free tier             |
   | Codex                                         | `npm i -g @openai/codex @zed-industries/codex-acp`, `codex login`  | ChatGPT plan or API   |
   | OpenCode                                      | `npm i -g opencode-ai`, `opencode auth login`                      | depends on provider   |
   | Ollama                                        | `ollama pull qwen3:8b`, `OLLAMA_CONTEXT_LENGTH=32768 ollama serve` | free, local           |
   | OpenRouter                                    | paste a key from openrouter.ai/keys, pick a `:free` model          | free models available |
   | LM Studio and other OpenAI-compatible servers | the server URL                                                     | free, local           |

3. **Tell the orchestrator what you want**, in any language, and approve its plan.

The [wiki](https://github.com/AerKov/aura/wiki) covers everything else: engines, agents and
projects, approvals and safety, skills, alerts, customization, the phone app, and your data.

## Privacy

Aura has no account and no telemetry. Prompts go only to the engine you choose (or nowhere, with local
models). Agent apps keep their own logins; Aura never reads them. API keys you paste stay in
`~/.aura/state`, outside git, and go only to their own service.

## Status

Proof of concept: the full loop works and is tested, with rough edges. Shell commands run in an OS
sandbox where available (macOS; Linux with bubblewrap and socat); check its status on the Engines
page. See the roadmap in
[docs/SPEC.md](docs/SPEC.md) and what changed in [CHANGELOG.md](CHANGELOG.md).

## Development

```sh
bun install
bun run dev            # server (watch) + desktop app, dev data in .aura-dev/
bun run typecheck
bun run lint           # biome; lint:fix applies fixes
bun test
bun run build          # compile the server sidecar, then tauri build
```

```
apps/server      Bun + Elysia: API, WebSocket, agents, engines, embedded SurrealDB
apps/desktop     Tauri 2 + React/Vite/Tailwind UI (also served to phones as a web app)
packages/shared  message protocol and shared types
docs/            spec, architecture decisions, wiki sources
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) first; architecture decisions are in
[docs/decisions](docs/decisions/). Security reports go through
[private advisories](https://github.com/AerKov/aura/security/advisories/new).

## License

[MIT](LICENSE)

# Architecture

```
┌──────────────────────────── your computer ─────────────────────────────┐
│  Tauri app: React shell (launcher, tiles, bar), sandboxed app frames   │
│          │ HTTP (Eden Treaty) + WebSocket                              │
│  Bun server (sidecar): Elysia                                          │
│   ├─ chat + realtime          ├─ approvals, skills, tasks              │
│   ├─ orchestrator + agents    ├─ alerts (webhooks), scheduler          │
│   ├─ guards (budgets, chains) ├─ customization, devices, push          │
│   ├─ apps (code, data, actions, backups) ├─ restore points, language   │
│   └─ engines ─┬ Claude Agent SDK ── Claude Code                        │
│               ├ ACP ── Gemini CLI / Codex / OpenCode                   │
│               └ Aura loop ── OpenRouter / Ollama / OpenAI-compatible   │
│  SurrealDB (embedded)        ~/.aura (git: agents, skills, themes…)    │
└────────────────────────────────────────────────────────────────────────┘
      ▲ phones connect over your network (paired, thin client)
```

- **Monorepo** (Bun workspaces): `apps/server`, `apps/desktop`, `packages/shared` (the message
  protocol and shared types, the single source of truth).
- **A core with apps** (ADR 0027, 0033): the core (database, shell, app runtime, catalog,
  approvals, restore points, localization) is always on; built-in apps (chats, skills, memory,
  schedule, signals) can be turned off, and every app, built in or the user's, has a chat. The
  user's apps are git repositories with their own data store; uninstalling keeps a backup.
- **Config in files, state in the database.** Agents, skills, themes, extensions and MCP servers are
  files in a git repository; chats, runs, tasks and approvals live in an embedded SurrealDB with live
  queries feeding the WebSocket.
- **One way to models:** the `LLMProvider` interface ("engines"). Feature code never calls a model
  SDK directly.
- **Agents act through tools**, all checked by the app: the agent's grants, the workspace, approvals
  for side effects.

## Decisions

The reasons behind the design are recorded as ADRs in
[docs/decisions](https://github.com/AerKov/aura/tree/HEAD/docs/decisions):

| ADR                                                                                                               | Topic                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [0001](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0001-surrealdb-embedded.md)                        | Embedded SurrealDB in the server process                                                                                           |
| [0002](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0002-server-desktop-wiring.md)                     | Server and desktop wiring                                                                                                          |
| [0003](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0003-local-session.md)                             | Automatic local session instead of a login (v1)                                                                                    |
| [0004](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0004-claude-agent-sdk-provider.md)                 | Claude Agent SDK provider and the user's own Claude Code                                                                           |
| [0005](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0005-agents-and-projects.md)                       | Agents as files, projects as chat + workspace, run scheduling and guards                                                           |
| [0006](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0006-approvals-skills-tasks.md)                    | Approvals, skills and tasks                                                                                                        |
| [0007](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0007-alerts-and-scheduling.md)                     | Alerts and scheduling                                                                                                              |
| [0008](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0008-customization.md)                             | Customization by chat (themes, MCP servers, UI extensions, safe mode)                                                              |
| [0009](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0009-mobile-pairing.md)                            | Mobile thin client, device pairing and notifications (accepted (changes the auth choice in CLAUDE.md; see "Better Auth"))          |
| [0010](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0010-visual-identity.md)                           | Aura's visual identity ("Workbench") (accepted (revised twice after feedback: violet gradients and glowing orbs read as a generic) |
| [0011](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0011-agent-engines.md)                             | Agent engines and Aura's own agent loop                                                                                            |
| [0012](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0012-acp-agents.md)                                | Other agent apps over the Agent Client Protocol                                                                                    |
| [0013](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0013-agent-memory.md)                              | Agent memory                                                                                                                       |
| [0014](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0014-conversation-routing.md)                      | Who answers a message                                                                                                              |
| [0015](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0015-command-sandbox.md)                           | OS sandbox for agents' shell commands                                                                                              |
| [0016](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0016-catalog.md)                                   | Catalog of packs                                                                                                                   |
| [0017](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0017-chat-summaries.md)                            | Rolling chat summaries                                                                                                             |
| [0018](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0018-project-containers.md)                        | A container per project (sandbox level 2) (superseded by 0030)                                                                     |
| [0019](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0019-mcp-in-containers.md)                         | MCP servers in project containers; agent apps stay on the host (superseded by 0030)                                                |
| [0020](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0020-integrations.md)                              | Integrations, secrets, agent variables and status (partly superseded by 0030)                                                      |
| [0021](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0021-side-panel-and-extension-api-v2.md)           | Side panel, project apps and extension API v2                                                                                      |
| [0022](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0022-per-agent-network.md)                         | Per-agent network rules (superseded by 0030)                                                                                       |
| [0023](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0023-budgets-in-tokens.md)                         | Optional budgets, in tokens or dollars                                                                                             |
| [0024](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0024-aura-as-an-app-shell.md)                      | Aura as a shell for apps                                                                                                           |
| [0025](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0025-app-data-and-actions.md)                      | App data and actions                                                                                                               |
| [0026](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0026-app-kit-and-community-apps.md)                | App kit, templates and community apps                                                                                              |
| [0027](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0027-core-and-built-in-apps.md)                    | The core and its built-in apps                                                                                                     |
| [0028](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0028-tiling-window-manager.md)                     | The shell as a tiling window manager                                                                                               |
| [0029](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0029-the-bar-as-an-app.md)                         | The bar as an app                                                                                                                  |
| [0030](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0030-local-only-and-per-app-secrets.md)            | Local only: no containers or host lists; MCP on the Agents page; each app's own secrets                                            |
| [0031](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0031-alerts-from-apps-relays-and-app-snapshots.md) | Alerts from apps, messages relayed by the orchestrator, app snapshots for agents                                                   |
| [0032](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0032-agents-transparency.md)                       | Everything about an agent on its card: the full prompt, its versions, its memory per run                                           |
| [0033](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0033-aura-as-a-shell.md)                           | Aura as a shell: a launcher, uninstall with a backup, restore points, libraries, Localization                                      |

The full product and architecture spec, including the roadmap, is
[docs/SPEC.md](https://github.com/AerKov/aura/blob/HEAD/docs/SPEC.md).

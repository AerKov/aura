# Architecture

```
┌──────────────────────────── your computer ─────────────────────────────┐
│  Tauri app: React shell (sidebar, chats, cards), sandboxed app frames  │
│          │ HTTP (Eden Treaty) + WebSocket                              │
│  Bun server (sidecar): Elysia                                          │
│   ├─ chat + realtime          ├─ approvals                             │
│   ├─ the Helper and @builder  ├─ apps (code, data, actions, secrets,   │
│   ├─ guards (budgets, chains) │   versions, backups)                   │
│   ├─ themes, language         │                                        │
│   └─ engines ─┬ Aura loop ── llama.cpp / Ollama / OpenAI-compatible    │
│               └ Claude Agent SDK ── Claude Code                        │
│  SurrealDB (embedded)        ~/.aura (git: agents, themes, apps…)      │
└────────────────────────────────────────────────────────────────────────┘
```

- **Monorepo** (Bun workspaces): `apps/server`, `apps/desktop`, `packages/shared` (the message
  protocol, shared types and the default theme: the single source of truth).
- **The server by domain:** `modules/ai`, `helpers`, `chats`, `apps` and `system`.
- **A small core for the user's apps** (ADR 0042): the Helper's chat, apps with their chats and
  @builder, approvals and versions, the AI, the theme and the language. Each app is a git
  repository with its own data store; uninstalling keeps a backup.
- **Config in files, state in the database.** Agents, themes and app code are files in git; chats,
  runs and approvals live in an embedded SurrealDB with live queries feeding the WebSocket.
- **One way to models:** the `LLMProvider` interface ("engines"). Feature code never calls a model
  SDK directly.
- **Helpers act through tools**, all checked by the app: the helper's grants, the app's folder,
  approvals for side effects.

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
| [0028](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0028-tiling-window-manager.md)                     | The window layout of the shell                                                                                                     |
| [0029](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0029-the-bar-as-an-app.md)                         | The bar as an app                                                                                                                  |
| [0030](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0030-local-only-and-per-app-secrets.md)            | Local only: no containers or host lists; MCP on the Agents page; each app's own secrets                                            |
| [0031](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0031-alerts-from-apps-relays-and-app-snapshots.md) | Alerts from apps, messages relayed by the orchestrator, app snapshots for agents                                                   |
| [0032](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0032-agents-transparency.md)                       | Everything about an agent on its card: the full prompt, its versions, its memory per run                                           |
| [0033](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0033-aura-as-a-shell.md)                           | Aura as a shell: a launcher, uninstall with a backup, restore points, libraries, Localization                                      |
| [0034](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0034-industry-look-and-plain-mode.md)              | The Industry look, a plain interface by default, the "My apps" menu                                                                |
| [0035](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0035-groups-deleting-chats-and-no-bundled-apps.md) | Groups of your own, deleting chats, secrets in the app, no bundled apps                                                            |
| [0036](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0036-files-in-chats-and-apps.md)                   | Files in chats and apps                                                                                                            |
| [0037](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0037-free-services-first.md)                       | Free services first (withdrawn by 0040)                                                                                            |
| [0038](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0038-built-in-llama-cpp.md)                        | The built-in llama.cpp                                                                                                             |
| [0039](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0039-a-simpler-product-model.md)                   | A simpler product model                                                                                                            |
| [0040](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0040-fewer-settings.md)                            | Fewer settings, one mode                                                                                                           |
| [0041](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0041-no-look-of-its-own.md)                        | Aura has no look of its own                                                                                                        |
| [0042](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0042-build-your-own-apps-by-chat.md)               | Aura is for building your own apps by chat                                                                                         |

The full product and architecture spec, including the roadmap, is
[docs/SPEC.md](https://github.com/AerKov/aura/blob/HEAD/docs/SPEC.md).

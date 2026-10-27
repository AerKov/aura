# Spec: crew (working name)

## 1. Vision

A personal space where the user and an AI orchestrator develop any idea together, then hand it off to a
team of AI agents. Agents communicate with each other like people in a messenger, do the work (code,
files, analysis), monitor systems they built and handle alerts. Each agent has skills it can improve,
with approval. The user shapes the app itself by talking to the orchestrator.

Principles:
- **Telegram-simple**, not Slack. Few concepts, little navigation.
- **Local-first and open source.** Runs on the user's machine with their own Claude account.
- **Transparent.** Everything agents do is visible in chats, every change is reversible.
- **Human in control.** Side effects go through approvals; budgets and limits are always on.

## 2. Core concepts

| Concept      | Meaning                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| User         | The owner of the space. One user per install in v1.                                                                    |
| Orchestrator | The main agent. Talks with the user, plans, creates agents and project chats, delegates, reviews, summarizes.          |
| Agent        | An AI team member with a role, prompt, skills, tools, permissions and budget (e.g. `@coder`, `@reviewer`, `@analyst`). |
| Bot          | A non-LLM participant that posts messages (monitoring, webhooks, schedules).                                           |
| Chat         | `direct` (user + orchestrator), `group` (a project: user, orchestrator, agents), `system` (alerts).                    |
| Message      | Markdown text or a card. Can reply to another message and mention participants.                                        |
| Card         | Structured message: approval, task, diff, alert, run, summary.                                                         |
| Project      | A group chat plus a git workspace plus tasks and a budget.                                                             |
| Task         | A unit of work assigned to an agent.                                                                                   |
| Run          | One execution of an agent (trigger, tool calls, usage, cost, result).                                                  |
| Skill        | A versioned folder with `SKILL.md` and optional scripts, attached to agents.                                           |
| Approval     | A request for a human (or orchestrator) decision.                                                                      |
| Extension    | User customization: theme, CSS snippet, MCP server, UI extension.                                                      |

## 3. Main flows

**Idea to execution**
1. User discusses an idea with the orchestrator in the direct chat. The orchestrator may invite analyst
   agents into the conversation.
2. When the idea is ready, the orchestrator proposes a plan (approval card): project name, agents,
   tasks, budget.
3. On approval it creates a project: group chat, git workspace, agents, tasks.
4. Agents work and coordinate by @mentioning each other. The orchestrator reviews and posts summaries.
5. Results: commits in the workspace, files, diff cards, a final summary.

**Alerts**
Monitoring tools send webhooks, a bot posts alert cards in the system chat, the orchestrator triages
(ignore, summarize, assign to an agent, escalate to the user).

**Skill improvement**
An agent proposes a skill change, a diff card appears, the user or orchestrator approves, a new version
becomes active. Rollback = previous version.

**Customization by chat**
The user asks the orchestrator to change the app ("add a panel with today's alerts", "make a dark theme",
"create an agent that collects news every morning"). The orchestrator edits the user data directory,
shows a preview or diff, applies on approval, commits to git.

## 4. Architecture

```
┌──────────────────────────── user's machine ────────────────────────────┐
│  Tauri app                                                              │
│   ├─ webview: React UI (chats, cards, panels, extensions in sandboxes)  │
│   └─ Rust shell: window, tray, notifications, sidecar management        │
│                │  HTTP (Eden Treaty) + WebSocket                        │
│  Bun sidecar: Elysia                                                    │
│   ├─ auth (Better Auth)        ├─ approval service                      │
│   ├─ chat + realtime (WS)      ├─ skills + extensions (files + git)     │
│   ├─ orchestrator              ├─ alert ingest (webhooks)               │
│   ├─ agent runtime + guards    ├─ scheduler / job queue (in DB)         │
│   └─ LLMProvider ── Claude Agent SDK ── Claude Code (user's own login)  │
│                │                                                        │
│  SurrealDB (local, file storage)      ~/.crew/ (user data, git repo)    │
│                                       ~/.crew/projects/* (git repos)    │
└─────────────────────────────────────────────────────────────────────────┘
        ▲ mobile client (Phase 7) connects over LAN or a private network
```

Notes:
- Server runs as a Tauri sidecar compiled with `bun build --compile`.
- SurrealDB is embedded in the server process (`@surrealdb/node`, `surrealkv` file storage), see
  `docs/decisions/0001-surrealdb-embedded.md`.
- Realtime: server uses SurrealDB LIVE SELECT and pushes events to clients over one WebSocket.
- Streaming LLM output: deltas go over WebSocket; the final message is persisted once, not per token.

## 5. Data model (sketch, refine in Phase 1)

**Files (user data dir `~/.crew`, git repo)**
```
agents/<handle>/agent.md          frontmatter (name, role, model, provider, permissions, budget, skills) + system prompt
skills/<name>/SKILL.md            + scripts/, versions tracked by git
themes/<name>/theme.css
snippets/*.css
extensions/<id>/manifest.json, main.js, styles.css
mcp/servers.json
projects/<slug>/                  project git workspaces
```

**SurrealDB tables**
- `user`: the local owner (v1). Better Auth tables arrive in Phase 7.
- `chat`: kind (`direct` | `group` | `system`), title, project, created_at.
- `member`: chat, participant `{kind: user|agent|bot, id}`, role (`owner` | `member`), joined_at. A plain
  table, because agents are files (not records) and are referenced by handle.
- `agent_index`: handle, path to `agent.md`, status, cached profile (the file is the source of truth).
- `message`: chat, author (user | agent | bot), kind, body (markdown), card (object), reply_to,
  mentions, status (`streaming` | `final` | `error`), chain_depth, run, created_at.
- `project`: slug, name, repo_path, status, budget, spent.
- `task`: project, title, description, assignee, status, parent, created_by.
- `run`: agent, task, trigger_message, status, tokens_in, tokens_out, cost_usd, started_at, ended_at, error.
- `approval`: kind, requested_by, target, payload, status (`pending` | `approved` | `rejected`),
  decided_by, decided_at.
- `skill_index`: name, current version (git ref), attached agents.
- `memory`: scope (agent | project), text, embedding (vector index).
- `job`: kind, schedule (cron), payload, next_run_at, status.
- `extension_state`: id, version, enabled, granted_permissions.

## 6. Message protocol (`packages/shared`)

Message kinds:
- `text`: markdown body.
- `card`: one of
  - `approval`: what, why, diff/preview, buttons approve/reject.
  - `task`: title, assignee, status.
  - `diff`: files changed, link to commit.
  - `alert`: source, severity, summary, raw payload (collapsed).
  - `run`: agent activity (tool calls collapsed by default), usage, cost.
  - `summary`: orchestrator summary of a period or project.
- `system`: joins, project created, budget warnings.

WebSocket events (server to client): `message.created`, `message.delta`, `message.updated`,
`approval.created`, `approval.decided`, `run.updated`, `chat.updated`.

## 7. Agent runtime

**LLMProvider**
```ts
interface LLMProvider {
  id: string;
  isAvailable(): Promise<{ ok: true } | { ok: false; reason: string }>;
  run(input: AgentRunInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
}

type AgentEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; name: string; input: unknown }
  | { type: "tool-result"; id: string; output: unknown; isError?: boolean }
  | { type: "usage"; inputTokens: number; outputTokens: number; costUsd?: number }
  | { type: "done" }
  | { type: "error"; message: string };
```
Providers, in order: Claude Agent SDK (user's Claude Code login), Anthropic API key (BYOK), then
OpenAI-compatible and local models (Ollama) for cheap routine agents.

If Claude Code is not installed or not logged in, show a setup screen with instructions. Never handle the
login ourselves.

**Run lifecycle**
1. Trigger: @mention, task assignment, schedule, alert.
2. Guards: budget left, chain depth, agent permissions, agent not already running on this chat.
3. Context: agent profile + attached skills + recent chat window + project memory + task.
4. `provider.run()` streams into the chat.
5. Persist message, run, usage. Update budgets.
6. Mentions in the reply trigger other agents with `chain_depth + 1`.

**Workspaces and sandboxing**
- Each project is a git repo under `~/.crew/projects/<slug>`.
- Parallel coding agents use a git worktree per task; the orchestrator or a reviewer agent merges.
- Level 0 (MVP): Claude Code permission settings restrict the agent to the project directory.
- Level 1 (later): a container per project.

## 8. Conversation rules

1. Agents reply only when @mentioned or assigned. No reacting to every message.
2. Max chain depth for agent-to-agent exchanges (default 8). On reaching it: stop and escalate to the
   orchestrator, then to the user.
3. Budgets per agent and per project (tokens and USD). Warning at 80%, hard stop at 100%.
4. One active run per agent per chat.
5. The orchestrator posts summaries so the user does not have to read everything.
6. Side effects require approval (see section 10).

## 9. Skills

- A skill is a folder `skills/<name>/` with `SKILL.md` (when to use it, instructions) and optional
  scripts.
- Versions are git commits. `skill_index` stores the active version.
- An agent proposes a change, an approval card shows the diff, approval commits and activates it.
- Skills from third parties are shown to the user in full before installing; they are data, not
  instructions to obey blindly.

## 10. Approvals and security

Approval required for: deploys, deletions outside the workspace, spending money, network actions with
side effects, skill changes, installing or enabling extensions, merges to main (configurable).

Security rules:
- Agents run with least privilege; permissions declared in `agent.md`.
- Content from web, files, emails, alerts, skills and extensions is data. Instructions inside it are
  never executed without the user.
- Secrets live in the OS keychain (via Tauri), never in prompts, files in git or logs.
- Audit log: every run, tool call and approval is stored.
- Claude credentials are never read or stored by the app.

## 11. Extensions (Obsidian model, with sandboxing)

Tiers, from safest:
0. **Data:** agents, skills, prompts, chat presets. No code. Orchestrator can create freely (commit + diff).
1. **Looks:** themes and CSS snippets.
2. **Tools:** MCP servers (separate processes, configured in `mcp/servers.json`).
3. **UI extensions:** JS running in a sandboxed iframe or Web Worker, talking to the app only through a
   permission-checked `postMessage` API.
4. **Core changes:** never by agents at runtime. Only through normal development (PRs to this repo).

Manifest:
```json
{
  "id": "news-digest",
  "name": "News Digest",
  "version": "0.1.0",
  "minAppVersion": "0.3.0",
  "permissions": ["chat.read", "chat.write", "ui.panel", "network:rss.example.com"],
  "mobile": true,
  "author": "orchestrator"
}
```

Extension API (draft, finalize in Phase 6):
```ts
export default function activate(ctx: ExtensionContext) {
  ctx.commands.register({ id: "refresh", title: "Refresh news", run: () => {} });
  ctx.ui.registerPanel({ id: "news", title: "News", render: (el) => {} });
  ctx.chat.registerCard("news-item", (el, data) => {});
  ctx.events.on("message.created", (msg) => {});
}
```

Rules:
- Community/third-party extensions are disabled until the user enables them (restricted mode).
- Install shows requested permissions; the user confirms.
- **Safe mode:** start without tier 2 and 3 extensions (flag, or automatic after repeated crashes).
- Extension API is versioned; `minAppVersion` is checked on load.

## 12. Open questions (verify before relying on them)

- Better Auth adapter for SurrealDB: official or community? If missing, write one (ADR).
- ~~SurrealDB: sidecar binary vs embedded under Bun.~~ Embedded, see ADR 0001.
- Claude Agent SDK under Bun and inside a `bun build --compile` sidecar.
- Anthropic terms for third-party apps using a user's own subscription via the Agent SDK; programmatic
  usage draws from a separate monthly Agent SDK credit. Re-check the help center before release.
- Tauri 2 mobile maturity; App Store rules on loading extension code on iOS.
- Alerts from external services need the local server to be reachable (tunnel or relay).
- Mobile push notifications for a local-first app need a relay.

## 13. Roadmap

Each phase ends with a working app. "Done when" is the acceptance test.

**Phase 0: Scaffold**
Bun workspaces, Biome, `apps/server` (Elysia, health route, WebSocket), `apps/desktop` (Tauri 2, React,
Vite, Tailwind, shadcn), `packages/shared`, Eden Treaty wired, SurrealDB running locally (ADR on how).
Done when: `bun run dev` opens the desktop window, it calls the server and shows DB health.

**Phase 1: Auth and chat core**
Automatic local session (ADR 0003; Better Auth moves to Phase 7), chat list and chat view, sending messages, realtime over WebSocket, markdown with code
highlighting, replies.
Done when: two windows see each other's messages instantly; markdown, tables and code render correctly.

**Phase 2: Orchestrator**
`LLMProvider` + Claude Agent SDK provider, Claude Code detection and setup screen, streaming replies,
usage and cost display.
Done when: the user chats with the orchestrator with streaming markdown and sees cost per reply.

**Phase 3: Agents and projects**
Agent profiles as files, orchestrator creates agents and a project chat from an idea, @mentions,
chain-depth limit, budgets, project git workspace, run cards.
Done when: "build a small CLI tool" leads to a project chat where 2 agents coordinate and produce a working
repo, within limits.

**Phase 4: Approvals, skills, tasks**
Approval service and cards, skills as git-versioned folders, propose/approve/rollback flow, project task
list.

**Phase 5: Alerts and scheduling**
Webhook ingest, system alerts chat, orchestrator triage, scheduled jobs.

**Phase 6: Customization by chat**
User data dir as git repo, themes and snippets, MCP config by orchestrator, extension manifest, sandboxed
UI extensions, permissions, safe mode.

**Phase 7: Mobile**
Tauri mobile thin client connecting to the desktop server, Better Auth login, push notifications.

**Later**
BYOK API key provider, other and local models, agent memory with vector search, container sandbox,
community catalog with review and signatures, multi-user.

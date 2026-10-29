# Spec: aura (working name)

## 1. Vision

A personal space where the user and an AI orchestrator develop any idea together, then hand it off to a
team of AI agents. Agents communicate with each other like people in a messenger, do the work (code,
files, analysis), monitor systems they built and handle alerts. Each agent has skills it can improve,
with approval. The user shapes the app itself by talking to the orchestrator.

Since Phase 21 (ADR 0024) Aura is a shell for the user's apps: it opens on a bare screen with apps
laid out as tiles, the messenger with the orchestrator is one of those apps, and every app has its
own chat (with topics) where the user both uses it and changes it with agents.

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
| Chat         | `direct` (user + orchestrator), `group` (a project or an app: user, orchestrator, agents), `system` (alerts).          |
| Topic        | A thread of a chat, like a Telegram forum topic: "General" plus topics the user creates. One level only.               |
| App          | A tool the user runs in the shell (UI in a sandbox, its own data, actions); a project whose workspace is its code.     |
| Layout       | Which apps are open as tiles and how the screen is split.                                                              |
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
│   └─ LLMProvider ─┬ Claude Agent SDK ── Claude Code (user's own login) │
│                   ├ ACP ── Gemini CLI / Codex / OpenCode (own logins)  │
│                   └ Aura loop ── OpenRouter / Ollama / OpenAI-compatible│
│                │                                                        │
│  SurrealDB (local, file storage)      ~/.aura/ (user data, git repo)    │
│                                       ~/.aura/projects/* (git repos)    │
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

**Files (user data dir `~/.aura`, git repo)**
```
agents/<handle>/agent.md          frontmatter (name, role, engine, model, tools, budget, skills) + system prompt
engines.json                      default engine, default model per engine, local server URLs (ADR 0011)
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
- `memory`: scope (agent | project), owner, text, search keys, optional embedding and its model
  (ADR 0013).
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
Engines (ADR 0011, 0012): Claude Agent SDK (user's Claude Code login); other agent apps over the
Agent Client Protocol: Gemini CLI, Codex, OpenCode (each under its own login, app tools served to
them over a per-run MCP endpoint); and Aura's own agent loop over OpenAI-compatible APIs: OpenRouter
(free models available), Ollama (local, free) and any compatible server. The default engine and a
per-agent engine are chosen on the Engines page.

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
- Each project is a git repo under `~/.aura/projects/<slug>`.
- Runs in one project are serialized (ADR 0005). Later, parallel coding agents use a git worktree per task;
  the orchestrator or a reviewer agent merges.
- Level 0 (now): the app's `canUseTool` check allows only granted tools and only paths inside the project
  directory (ADR 0005).
- Level 1 (ADR 0015): shell commands of Claude Code and Aura's own agent run in an OS sandbox
  (bubblewrap on Linux, Seatbelt on macOS): writes only in the project folder, no credentials,
  no network (ADR 0030). Modes `auto`, `required`, `off` in `sandbox.json`.
- Project containers (ADR 0018, 0019) were removed in ADR 0030: Aura is local only.

## 8. Conversation rules

1. Agents reply only when addressed: @mentioned or assigned a task by anyone, or addressed by the user.
   A user's message always has one addressee (ADR 0014): the agents it mentions, else the agent it
   replies to, else an agent named first ("coder, …"), else the orchestrator, which routes it.
   Agents wake each other only by @mention. No reacting to every message.
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

Implemented API (Phase 6, extended in Phase 18, ADR 0021): `ctx.ui.registerPanel`, `ctx.ui.form`,
`ctx.ui.button`, `ctx.context()`, `ctx.chat.*`, `ctx.alerts.recent()`, `ctx.events.on`,
`ctx.storage.*`, `ctx.net.fetch` (manifest `hosts`, server-side `secrets`), `ctx.agents.ask`,
`ctx.files.*`; an `icon` from a fixed list. Extensions open in the side panel next to a chat; a
project can pin one as its app.

Original draft:
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
- **Safe mode:** start without tier 2 and 3 extensions (flag, or automatic after repeated crashes at
  startup). The user can leave automatic safe mode from the app without a restart.
- Extension API is versioned; `minAppVersion` is checked on load.

## 12. Open questions (verify before relying on them)

- Better Auth adapter for SurrealDB: official or community? If missing, write one (ADR).
- ~~SurrealDB: sidecar binary vs embedded under Bun.~~ Embedded, see ADR 0001.
- ~~Claude Agent SDK under Bun and inside a `bun build --compile` sidecar.~~ Works; the sidecar uses the
  user's installed `claude` (ADR 0004).
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
Mobile thin client (web/PWA served by the desktop server; Tauri mobile later) paired with the desktop by a
one-time code, push notifications (ADR 0009).

**Phase 8: Own visual identity**
A distinct look and feel instead of a Telegram clone: Aura's own design language (layout, typography,
color, motion, agent presence), light and dark themes.

**Phase 9: Agent engines**
A choice of engines per agent: Claude Code; Gemini CLI, Codex and OpenCode over ACP (ADR 0012); or
Aura's own agent loop on OpenRouter, Ollama or any OpenAI-compatible server, with built-in file,
shell and web tools (ADR 0011).

**Phase 10: Agent memory**
Agents remember notes across runs (`remember`, `recall`, `forget`), per agent and per project;
relevant notes are added to each run. Keyword search everywhere, semantic search with a local
embedding model; a Memory screen to review and delete (ADR 0013).

**Phase 11: Conversation flow**
@mention suggestions in the composer (also `/name`), a reply wakes the agent replied to, a message
that names an agent goes to it, and the orchestrator routes the rest; the composer shows who will
answer before sending (ADR 0014).

**Phase 12: Command sandbox**
Agents' shell commands run in an OS sandbox (Claude Code's own, and the same runtime for Aura's
agent): writes only in the project, no credentials, no network (ADR 0030); a card on the
Engines page; new Aura mark (ADR 0015, 0010).

**Phase 13: Catalog**
Ready-made packs of agents, skills, themes and extensions: built in, or from a GitHub URL. A preview
shows every file and diff with a hash, then one commit installs it; the orchestrator can offer a
pack as an approval (ADR 0016).

**Phase 14: Long chats**
Older messages are folded into a rolling summary per chat that agents get with the recent
messages; it counts towards budgets, can be read and cleared from the chat, and turned off on the
Memory page (ADR 0017).

**Phase 15: Project containers (removed in phase 32, ADR 0030)**
Sandbox level 2: a project can run its agents' shell commands in its own container that sees only
the project folder; set per project in its chat, defaults on the Engines page (ADR 0018).

**Phase 16: MCP servers in containers (removed in phase 32, ADR 0030)**
In container projects, stdio MCP servers start inside the project's container, with secrets passed
as environment; they never fall back to the host. Agent apps stay on the host because of their
logins (ADR 0019).

**Phase 17: Integrations and diagnostics** (the page became part of Agents in phase 32)
From the alpha feedback: an Integrations page for MCP servers with a connection test, secrets kept
by Aura, variables for agents' commands, an Agents page that shows what stops an agent, a host
check, no silent agents, read-only setup inspection for the orchestrator, the user guide built in
for the orchestrator, and agent changes and project membership by request (ADR 0020).

**Phase 18: Side panel and extensions v2**
From the alpha feedback: a side panel next to the chat where extensions open with the chat as their
context, project apps that open by themselves, extension storage, network to approved hosts with
secrets filled in by the server, asking agents as the user, reading project files, extension icons,
form and button helpers, and an arrangeable rail (ADR 0021).

**Phase 19: Per-agent network rules (removed in phase 32, ADR 0030)**
Each agent can have its own allowed hosts on top of (or instead of) the shared list, and WebFetch
limited to them; enforced per command in the OS sandbox, in Claude Code's sandbox and tool checks,
and for ACP fetches; editable on the agent's card or proposed by the orchestrator (ADR 0022).

**Phase 20: Budgets that mean something**
From alpha feedback: budgets are optional, in tokens (subscriptions) or dollars (paid APIs),
changeable at any time from the chat header and the agent's card, or proposed by the orchestrator;
replies show tokens (ADR 0023).

**Phase 21: Shell**
Aura opens on a bare screen with apps as tiles (splits, resize; one app per tile since ADR 0027), saved and restored. The
messenger becomes the first app. First launch: the orchestrator's chat on the whole screen with an
onboarding that explains Aura; the user then changes the layout by asking the orchestrator or by
clicking (ADR 0024).

**Phase 22: Topics**
Chats get topics: "General" plus topics the user creates, renames and closes. A topic shows only its
messages; agents get only their topic as context; a message can be moved to another topic.

**Phase 23: Apps with chats** (done: @builder, drafts served apart from the live HEAD, diff cards,
versions; ADR 0024)
An app is a project whose workspace holds its code, with its own chat. In it agents use the app and
change it: diffs with approval, one commit per change, live reload, rollback. The orchestrator
creates apps from an idea.

**Phase 24: App data** (done, ADR 0025)
Each app keeps data where the user decides: its own SurrealDB datastore (collections with a
schema, live queries) or files in its folder. Never in the main database. Export, backup, delete
per app.

**Phase 25: Actions and contracts** (done: declarative actions, ADR 0025)
An app declares actions (exposed like MCP tools) and what it lets others read. Agents call them in
the app's chat; another app calls them only with the user's permission for those actions.

**Phase 26: App kit** (done, ADR 0026)
Themed components (table, form, board, card, chart) and templates (CRM, tasks, notes), so agents
build reliable apps from data and views instead of raw DOM.

**Phase 27: Community apps** (done, ADR 0026)
Apps in the catalog: install, change in their chat, updates from the author merged with the user's
changes.

**Phase 28: Home and single-app tiles** (done, ADR 0027)
The Home shelf (a grouped launcher since phase 35: your apps, Add an app, built-in apps, a welcome card) on an empty screen. A tile
shows one app, no tabs; an app's chat opens as a panel inside its tile; nothing opens by itself.

**Phase 29: The core and built-in apps** (done, ADR 0027)
Chats, Skills, Memory, Schedule and Signals (and Integrations, until ADR 0030) can be turned off on Home, with their
dependencies; off means their routes, background work and agent tools are gone, without a restart.
Config in `modules.json`.

**Phase 30: Window layout** (done, ADR 0028)
Tiles with gaps, corners, borders and title bars set by the user (presets Airy and Compact), the bar
on any edge with status (approvals, working agents, clock, connection), keyboard shortcuts with a
chosen Mod key, Home as a launcher in any number of tiles.

**Phase 31: The bar as an app** (done, ADR 0029)
The bar is built in, the user's own bar app (code changed in its chat with approval and
versions, `ctx.bar`), or off; the built-in bar stands in when the bar app fails.

**Phase 32: Local only** (done, ADR 0030)
No project containers, host lists or Integrations page; agents' commands have no network; MCP
servers and agents' secrets are on the Agents page; each app keeps its own secrets.

**Phase 33: Alerts from apps, relays, app snapshots** (done, ADR 0031)
Apps post alert cards with `alerts.write`; the orchestrator passes a message into another of its
chats only on the user's request; agents in an app's chat see the app as the user sees it.

**Phase 34: Agents in the open** (done, ADR 0032)
An agent's card shows its whole system prompt part by part (its own and what Aura adds), lets the
user edit its own prompt with a diff and bring back older versions, and lists its notes and recent
runs with the notes each run was given.

**Phase 35: Aura as a shell** (done, ADR 0033)
A launcher with groups, descriptions and search; uninstall with a backup and bring apps back;
restore points of the whole Aura, back and forward; libraries from npm inside apps; the
Localization app (English, Ukrainian, more as files).

**Phase 36: The Industry look and the "My apps" menu** (done, ADR 0034)
Round 4 of the redesign: Industry tokens and fonts, square marks, a plain interface with an
advanced mode, the "My apps" menu over the tiles, "New window", the "New app" sheet, the bar and
tile bars.

**Phase 37: Chats and app tiles** (done, ADR 0034)
The chat list, a calmer feed (run cards collapsed, approvals in plain words with technical details
on request, alerts by severity), the composer, and an app's tile with its chat panel, draft and
versions. A chat's helpers are added and removed from its header ("+ Helper"). Follow-up (ADR 0035): groups of the user's own, deleting chats, limits in the header, secrets on the app's tile, no bundled apps.

**Phase 37b: Files** (done, ADR 0036)
Files in chats (attach from the computer, helpers read them and hand files back), files in apps
(`docs`: add, keep, view, print, save), and a viewer window for PDFs, images and text with Print.

**Phase 38: Helpers** (next, ADR 0034)
One app for everything about agents: Team, Skills, Memory and AI connection.

**Phase 39: Splash and onboarding** (ADR 0034)
A splash while Aura starts and three first-run steps: welcome and language, AI connection, the
first app.

**Later**
Pack signatures and a reviewed community index, multi-user.

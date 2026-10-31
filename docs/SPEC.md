# Spec: aura (working name)

## 1. Vision

**Build your own apps by chatting, on your own computer** (ADR 0042). The user tells the Helper what
they need; the Helper proposes an app; each app is a git folder with its own data, secrets and a
chat beside it, where @builder changes it. Every change is a diff the user approves, every version
can be restored. The look and the language are changed by asking too.

Principles:
- **Small core.** A sidebar (the Helper, the apps, Settings) and one thing beside it. New ideas
  become apps of the user's before they become features of Aura.
- **Local-first and open source.** Runs on the user's machine, with a local model or their own
  Claude Code login.
- **Transparent.** Every change is visible as a diff and reversible as a version.
- **Human in control.** Side effects go through approvals; budgets and limits are always on.

## 2. Core concepts

| Concept  | Meaning                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------- |
| User     | The owner. One user per install.                                                                |
| Helper   | The orchestrator. Talks with the user in the direct chat, proposes apps, changes the look.      |
| @builder | The helper that writes and changes apps, in each app's chat.                                    |
| App      | A git folder in `projects/<id>`: code run in a sandboxed frame, its own data store and secrets. |
| Chat     | `direct` (user + Helper) or `group` (an app's chat: user + @builder).                           |
| Message  | Markdown text or a card. Can reply to another message and mention helpers.                      |
| Card     | `run` (what a helper did) or `approval` (a decision for the user).                              |
| Run      | One execution of a helper (trigger, tool calls, usage, cost, result).                           |
| Approval | A change waiting for the user: a new app, an app change, a theme, a deletion.                   |
| Theme    | A CSS file of the user's: every colour, font, corner and motion of Aura (ADR 0041).             |

## 3. Main flows

**A new app.** The user describes it to the Helper (or presses **New app**). The Helper proposes it
with `create_app`; on approval Aura makes the folder, the app's chat and @builder, and @builder
builds it there.

**Changing an app.** In the app's chat the user says what to change. @builder edits the folder; when
the run ends Aura shows the diff as an approval card and lets the user preview the app after the
change. Yes commits it as a new version; no discards it. Any version can be restored.

**Changing Aura.** "A greener sidebar", "rounder corners", "speak Ukrainian": the Helper proposes
CSS for the user's theme (with a try-on) or sets the language.

## 4. Architecture

```
┌──────────────────────────── user's machine ────────────────────────────┐
│  Tauri app                                                              │
│   ├─ webview: React UI (sidebar, chats, cards, apps in sandboxes)       │
│   └─ Rust shell: window, sidecar management                             │
│                │  HTTP (Eden Treaty) + WebSocket                        │
│  Bun sidecar: Elysia                                                    │
│   ├─ local session             ├─ approval service                      │
│   ├─ chat + realtime (WS)      ├─ apps: code, data, actions, secrets    │
│   ├─ the Helper and @builder   ├─ themes and language                   │
│   ├─ agent runtime + guards    │                                        │
│   └─ LLMProvider ─┬ Aura loop ── llama.cpp / Ollama / OpenAI-compatible │
│                   └ Claude Agent SDK ── Claude Code (user's own login) │
│                │                                                        │
│  SurrealDB (local, file storage)      ~/.aura/ (user data, git repo)    │
│                                       ~/.aura/projects/* (app repos)    │
└─────────────────────────────────────────────────────────────────────────┘
```

Notes:
- Server runs as a Tauri sidecar compiled with `bun build --compile`.
- SurrealDB is embedded in the server process (`@surrealdb/node`, `surrealkv` file storage), ADR 0001.
- Realtime: server uses SurrealDB LIVE SELECT and pushes events to clients over one WebSocket.
- Streaming LLM output: deltas go over WebSocket; the final message is persisted once.

## 5. Data model

**Files (user data dir `~/.aura`, git repo)**
```
agents/<handle>/agent.md   frontmatter (name, role, engine, model, tools, budget) + system prompt
engines.json               default engine and models, local server URLs (ADR 0011)
themes/<name>/theme.css    the look (themes/default is Aura's default, the user's own copy)
snippets/*.css
locales/                   the user's translations
projects/<id>/             one git repo per app (outside the data dir's own history)
backups/                   uninstalled apps
state/                     the database, app datastores, secrets.json (outside git)
```

**SurrealDB tables:** `chat` (kind, title, project), `member`, `message` (chat, author, kind, body,
card, reply_to, mentions, status, chain_depth, run), `project` (an app: slug, name, workspace,
data store, budget, spent), `run`, `approval`, `extension_state` (enabled, granted permissions),
`setting` (theme, language).

## 6. Message protocol (`packages/shared`)

Message kinds: `text` (markdown), `card` (`run` or `approval`), `system` (app created, budget
warnings). WebSocket events (server to client): `message.created`, `message.delta`,
`message.updated`, `message.deleted`, `chat.updated`, `chat.removed`, `app.data`, `app.snapshot`,
`customize.updated`.

## 7. Agent runtime

**LLMProvider**
```ts
interface LLMProvider {
  id: string;
  isAvailable(): Promise<{ ok: true } | { ok: false; reason: string }>;
  run(input: AgentRunInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
}
```
Engines (ADR 0011, 0038, 0042): Aura's own agent loop over OpenAI-compatible APIs (the built-in
llama.cpp, Ollama, LM Studio or any compatible server) and the Claude Agent SDK under the user's
Claude Code login. Settings → AI picks one for the Helper and one for @builder. If Claude Code is
not installed or not logged in, Aura says how to fix it; it never handles the login.

**Run lifecycle**
1. Trigger: a user's message or an @mention.
2. Guards: budget left, chain depth, tools granted, one run at a time per app.
3. Context: the helper's profile + the recent chat window + the app's tools.
4. `provider.run()` streams into the chat.
5. Persist message, run, usage. Update budgets. In an app's chat, offer the diff for approval.
6. Mentions in the reply trigger other helpers with `chain_depth + 1`.

**Sandboxing:** a helper's file tools reach only its folder (ADR 0005); shell commands run in an OS
sandbox (bubblewrap on Linux, Seatbelt on macOS) with writes only in the folder, no credentials and
no network (ADR 0015, 0030).

## 8. Conversation rules

1. A user's message always has one addressee (ADR 0014, 0042): the helpers it mentions, else the one
   it replies to, else one named first, else the Helper, else the chat's only helper (@builder in
   an app's chat). Helpers wake each other only by @mention.
2. Max chain depth for helper-to-helper exchanges (default 8); then stop and ask the user.
3. Budgets per helper and per app (tokens and USD). Warning at 80%, hard stop at 100%.
4. Side effects require approval (section 9).

## 9. Approvals and security

Approval required for: a new app, every change to an app, deleting an app's data, a theme or
snippet, granting an app more permissions.

- Helpers run with least privilege and edit only the user data directory; Aura's code is read-only.
- Web pages, files and apps' content are data. Instructions inside them are never executed.
- App secrets live in `state/secrets.json` (outside git), are never shown to helpers, and are filled
  in by the server only in requests to hosts the app was allowed to reach.
- Every run, tool call and approval is stored.
- Claude credentials are never read or stored by the app.

## 10. Apps (sandboxed, Obsidian-like)

An app is `manifest.json`, `main.js` and `styles.css` (plus libraries in `lib/`) in its folder. It
runs in a sandboxed iframe (opaque origin, no network, strict CSP) and talks to Aura only through a
permission-checked `postMessage` API: `ctx.ui.*`, `ctx.kit.*` (themed tables, forms, boards,
charts bound to collections), `ctx.data.*` (its collections), `ctx.actions.*`, `ctx.storage.*`,
`ctx.net.fetch` (listed hosts, server-side secrets), `ctx.docs.*` (its files), `ctx.agents.ask`,
`ctx.chat.*`, `ctx.apps.call`. Permissions are shown before they are granted. **Safe mode** starts
with apps off (flag, or automatic after repeated crashes at startup).

## 11. Open questions (verify before relying on them)

- Anthropic terms for third-party apps using a user's own subscription via the Agent SDK. Re-check
  the help center before release.
- A phone client again, once the desktop is simple and stable.

## 12. Roadmap

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

**Phase 37c: Free services first** (done, ADR 0037)
Free OpenAI-compatible services (Google Gemini, Groq, OpenRouter, Cerebras, Mistral) lead the
engine choice, with a one-step "paste a key" start; local models next; agent apps as advanced.

**Phase 37d: Built-in llama.cpp** (done, ADR 0038)
Install llama.cpp from the official release and download a local model (curated list or any
Hugging Face GGUF) after an approval card; the server runs on demand on 127.0.0.1.

**Phase 38: Settings and helpers** (done, ADR 0039, 0040)
One Settings app with tabs (AI, Helpers, Automations, Look, History); a helper's card holds its AI;
tool servers and secrets in one place; no free cloud services, no advanced mode, no switches.
Next: the server by domain and one secret store, then the data migrations of ADR 0039.

**Phase 38b: No look of its own** (done, ADR 0041)
The default look as the user's theme file, named parts with their own variables and `data-part`,
`describe_look` for the Helper, no Look tab; built-in apps replaceable by the user's apps.

**Phase 39: Build your own apps by chat** (done, ADR 0042)
Aura narrows to its idea: the Helper's chat, the user's apps with @builder beside them, approvals
and versions, the AI, the theme and the language. ACP engines, MCP, the phone, the catalog, alerts
and schedules, groups, teams, tasks, topics, skills, memory, summaries, restore points, the tiling
window manager and the bar are gone. A new default look drawn from the mark: an ink sidebar
that folds, the mark's blues, a faint breathing aura behind the panels, the living mark on empty
chats, rounded corners and spring animations.

**Phase 40: Share apps as `.aura` files** (next)
**Export** in an app's menu saves a `.aura` file: its code and versions as a git bundle and its
manifest; never its secrets, its data only on request. **Install an app** takes a file (or a drop)
and shows an approval card with what it asks for (permissions, hosts, secret names) and warnings.
An installed app is an app like any other, with its chat and @builder. The archive is data: names,
sizes and paths are checked, and the app runs in the same sandbox.

**Phase 41: An app as a desktop program**
A ready-made **Aura App Runner** (Tauri, built in CI for macOS, Windows and Linux) runs one app
outside Aura: the same frame and `ctx` (kit, data, storage, docs, net with the app's own secrets),
without helpers. **Make a program** packs an app with the runner (a named `.app` with its icon on
macOS, an `.exe` with its folder on Windows, an AppImage on Linux) in seconds, with no Rust or Tauri
on the user's computer. The app runtime moves out of the server into a module both share.

**Phase 42: Publish an app to the web**
From an app's menu: a static build for apps whose data stays in the visitor's browser, or a small
server (the runtime of phase 41) for apps that share data, deployed where the user chooses. The
user's own copy keeps living in Aura; publishing is an approval like any side effect.

**Phase 43: First run**
A splash while Aura starts and three first-run steps: welcome and language, the AI, the first app.

**Later**
A phone client for the simplified desktop; a reviewed index of community apps; multi-user.

# Changelog

Versions follow the roadmap phases in [docs/SPEC.md](docs/SPEC.md). The format is based on
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

- **Files in chats.** Attach files from your computer (the paperclip, drag and drop, or paste); the
  helpers read them, and in a project a helper can hand you a finished file back. Click a file to
  look at it; the arrow saves it to your computer.
- **A viewer for PDFs, images and text**, with **Print** and **Save**, for chats and apps.
- **Files in apps.** A new `docs` permission and `ctx.docs`: the user adds files from their computer,
  an app keeps and shows them (a PDF opens in the viewer with Print), makes files of its own (an
  invoice, a CSV) and saves them to the computer. @builder knows the API.
- An app's backup includes its files; deleting a chat deletes its files.

- **Your own groups.** "New group" at the top of the chat list: a name and the helpers you choose.
  Groups have their own section.
- **Delete a chat** from its header: a group, or a project (its files are kept in the backups
  folder). An app's chat goes with the app.
- **Limits are back** in a project's chat header (tokens, dollars or none), in plain mode too.
- **An app's secrets** are set with the key button next to its Chat button, nowhere else.
  @builder names the secrets and tells you to enter them.
- **A click on a helper's mark** in a chat opens that helper's settings.
- The window presets are called **Airy** and **Compact**.
- The catalog no longer offers the CRM, Tasks and Notes apps.
- **A clearer README, wiki and screenshots.** The README says what Aura is up front; the images in
  `docs/assets` are retaken from the real app. `bun scripts/demo.ts` starts a demo with sample
  chats and an app; `scripts/screenshots.cjs` retakes the images from it.
- Helpers' marks show their names' initials ("H" for the Helper) everywhere; the Helpers page shows
  names, not @handles, in plain mode; the chat list shows a decision's title instead of
  "[approval]"; chat headers fit narrow tiles.

## [0.37.0] - 2026-10-29: Chats and app tiles in the new look

- **The chat list** is grouped into your chat with the Helper, Projects, Apps and Alerts. A row
  says who is working ("Coder is working…") and how many decisions wait there.
- **Calmer chats.** A helper's work is one line ("looked at 2, changed files: 3, checked, all
  works") with **Details** on request. **Decision cards** say in plain words what will change and
  warn when an app asks for more; "Technical details" shows the diff. **Alerts** show how urgent
  they are with a coloured bar.
- **The composer** says who will answer ("Answers: Helper") and that @ calls another helper.
- **+ Helper** in a group chat's header adds a helper to the chat or removes one; the chat says
  "@x joined the chat." Budgets, summary and webhooks are in advanced mode.
- **App tiles:** "Now / After the change" to try a change before you decide, "History of changes"
  with "Bring back", and the app's chat beside it ("App chat", who is working).
- Fix: saving to the data folder retries when git is busy, instead of failing.

## [0.36.0] - 2026-10-29: A new look and the "My apps" menu

- **A new look** (the "Industry" design): square corners, hairline borders, steel blue, Barlow
  fonts, in light and dark. Agents' marks are told apart by their fill, not colour.
- **Plain words by default.** Apps are called Chats, Alerts, Reminders, Helpers, Look, Language,
  Phone, Backups and Ready-made packs. **Advanced mode** (a switch in "My apps") shows the
  technical names, details and every app.
- **"My apps"**: the A at the top of the bar (or Alt+H) opens every app by group over your work,
  with a search. An empty tile ("New window") shows the same list. **New app** opens on the right.
- The bar and the tiles' title bars follow the new design: the clock, the connection and the
  number of decisions waiting at the bottom of the bar; "Open another app here" and "New window
  beside" on every tile.
- Docs: the alpha notes, README, architecture overview and ADR table are up to date; unused code
  removed.

## [0.35.0] - 2026-10-29: Aura as a shell

- **Home is a launcher**: every app by group, with a one-line description, and a search box. Apps
  say their group and description in their manifest; @builder keeps them up to date (WISH-10,
  WISH-11).
- **Uninstall an app** from its menu on Home: a backup of its code, versions, data and chat (as
  text) is kept, and **Restore points** brings it back with a new chat.
- **Restore points** of the whole Aura: agents, skills, themes, tool servers, settings and every app
  with its code and data. Going to one saves the present first, so you can come back forward. The
  orchestrator saves one before bigger changes and asks before going to one.
- **Libraries in apps**: @builder adds a library from npm (an exact version, kept in the app's
  folder) instead of being limited to the kit. The change card lists it.
- **Localization**: one language for Aura's interface, its agents' answers and your apps
  (`ctx.language`). English and Ukrainian are built in; more as files in `locales/`.

## [0.34.0] - 2026-10-28: Agents in the open

- An agent's card on the **Agents** page shows its **whole system prompt**: its own prompt and each
  part Aura adds when it runs (team rules, skills, the Aura guide, the sandbox, variable names,
  memory, your language) (WISH-9, WISH-11).
- **Edit its prompt** right there: review the diff, then save. Every save is a version; **Versions of
  its prompt** shows what each one changed and can bring an older one back.
- **Memory and recent runs**: what the agent remembers, and for each recent run its chat, tools,
  tokens and which notes it was given.

## [0.33.0] - 2026-10-28: Alerts from apps, relays, a look at the app

- Apps can post **alert cards** to the Signals chat with the new `alerts.write` permission
  (`ctx.alerts.post`), handled like a monitoring system's (WISH-7).
- Ask the orchestrator to **pass a message into another chat** it is in; it posts as itself, marked as
  sent at your request, and only when you ask (WISH-8).
- **@builder can look at the app** it changes: an outline of the page and its errors, while the app is
  open on your screen (Draft shows its change) (WISH-2).

## [0.32.0] - 2026-10-28: Local only

- **Integrations is gone.** Tool servers (MCP) and agents' secrets are on the **Agents** page now,
  under each agent's card. Variable sets and the host check are removed (WISH-4).
- **No project containers and no host lists** (WISH-6): agents' commands run in the sandbox with no
  network; agents use the web through their engine's own web tools. Old network settings in agent
  files are ignored.
- **Each app has its own secrets**: the key button on its tile. Only that app can use them, in its
  requests to its approved hosts; keys it was given before are copied over once. Apps keep `net`.

## [0.31.1] - 2026-10-28: Feedback fixes

- Your own bar on the top edge no longer covers the tiles' buttons, and its CSS can no longer make
  it taller or push the tiles down: the bar stays inside its strip (BUG-1, BUG-2).
- **Bar thickness** in Customize → Window manager, 24–96 px; your bar gets it as `state().size`
  (WISH-1).
- A chat's **Apps** button shows only for an app's chat or a project with its own app; it no longer
  opens the first installed app (BUG-3).
- The **Tasks** button is gone from chats (WISH-5).
- The bar's README says which permissions it may use (`net` with hosts for a weather widget…)
  (WISH-3).

## [0.31.0] - 2026-10-28: Your own bar

- The bar can be **your own code**: an app you change in its chat with @builder (or by asking the
  orchestrator), with each change approved as a diff, a draft to try and versions to go back to.
  It starts as a copy of the built-in bar.
- The bar can be turned **off**: Home (Mod+H) and the keyboard remain.
- If your bar breaks, the built-in bar takes over and Customize says why.

## [0.30.0] - 2026-10-28: A tiling window manager

- Tiles look like a tiling window manager: gaps, round corners, a coloured border on the focused
  tile, thin or hidden title bars. Presets **Hyprland** (default) and **i3**, or set each value on
  **Customize → Window manager**.
- The bar goes on any edge (left, right, top, bottom) and shows approvals waiting, agents at work,
  the clock and the connection.
- Keyboard: Mod+arrows to move between tiles, Mod+Shift+arrows to swap them, Mod+Enter for a new
  tile, Mod+Q to close, Mod+H for Home, Mod+1…9 for the bar's apps. Mod is Alt, Ctrl+Alt or Super.
- Home can be open in several tiles, like a launcher.

## [0.29.0] - 2026-10-28: Home and built-in apps

- **Home**: Aura opens on a shelf of your apps, with **Add an app** (templates, the catalog, an
  empty app for @builder) and the built-in apps. The logo in the rail brings it back.
- **No more tabs**: a tile shows one app. Clicking an app replaces the one in the focused tile;
  Shift-click opens it beside.
- An app's **Chat** opens as a panel inside the app, and nothing opens by itself next to a chat.
- **Built-in apps can be turned off**: Chats (with the orchestrator and agents), Skills, Memory,
  Schedule, Signals and Integrations. Off means off on the server too: no routes, no agent tools,
  nothing running. Saved in `~/.aura/modules.json`.

## [0.27.2] - 2026-10-28: Apps and safe mode

- An app's tile no longer stays empty: it says why the app is not shown (safe mode, turned off, a
  problem) and offers to fix it (**Leave safe mode**, **Turn on**).
- Safe mode can be left from the app, without a restart (not when forced by `AURA_SAFE_MODE`).
- Safe mode no longer turns on after a few short sessions: a start counts as clean after 10 seconds
  (was a minute) and on a normal shutdown.

## [0.27.1] - 2026-10-28: Startup fix

- The window waits up to 30 seconds for the server to start instead of failing at once with "Could
  not start a local session" (the first start after an install can be slow while the new binary is
  scanned).
- If the server stops or cannot start, the window says so, shows its last output lines, and offers
  **Try again**. A refused session now says why.

## [0.27.0] - 2026-10-28: App kit and community apps

- App templates: **+ → New app** starts from CRM, Tasks or Notes, ready to use and to change in
  their chat.
- The app kit: tables with search and sorting, forms built from the data's fields, boards with drag
  and drop, cards, charts and numbers, all live and in the current theme. @builder uses them.
- Apps in catalog packs (built in or from a link) install with their own chat. Updates from the
  author are merged with your own changes; the preview says what happens.

## [0.25.0] - 2026-10-28: App data and actions

- Each app keeps its data in its own store: a database of its own (default) or JSON files in its
  folder. Switch, export or delete it from the database button on the app's tile. Nothing goes in
  Aura's main database.
- Apps declare collections (with field types) and see changes live, also those made by agents.
- Actions: an app offers named operations (find, add, update, delete…). Agents in the app's chat use
  them for you; deleting asks first.
- Apps can use each other's actions only when one offers them and you approved the other's request,
  shown on its card.

## [0.23.0] - 2026-10-28: Apps with chats

- Apps: make one with **+ → New app** or by asking the orchestrator. Each app has its own chat
  (listed under Apps) with @builder, the agent that writes it, and opens next to it.
- Say what to change in the app's chat; the change comes as a diff on a card. Approve and the app
  reloads; reject and it is thrown away. **Draft** on the app's tile tries the change first.
- A change that asks for more permissions, hosts or secrets says so; nothing is granted before you
  approve.
- Versions: restore any earlier version of an app from its tile.

## [0.22.0] - 2026-10-28: Topics

- Chats have topics, like Telegram forum topics: General plus your own (+ Topic under the chat
  header). A topic shows only its messages; agents woken there see only that topic, answer in it,
  and post their cards there; each topic keeps its own summary.
- Move a message to another topic (the arrows button on hover); rename, close and reopen topics.
- The **+** menu on a tile lists your apps separately and says how to get one when there are none.

## [0.21.0] - 2026-10-28: The screen

Aura becomes a shell for your apps (ADR 0024).

- Apps open as tiles: side by side, stacked or as tabs, resizable, saved between launches. The
  messenger (Chats) is the first app; the pages and installed extensions are apps too.
- Shift-click an icon in the rail, or **+** in a tile's bar, to open an app on the right or below.
- The orchestrator arranges the screen on request ("open Agents on the right").
- A project's app opens as a tile next to its chat (it replaces the side panel).
- First launch: Chats on the whole screen with a welcome from the orchestrator that explains Aura.
- A phone shows one app at a time and leaves the computer's tiles alone.

## [0.20.0] - 2026-10-27: Budgets in tokens

- Budgets are optional: new projects have no limit unless you set one.
- A limit can be in tokens (right for subscriptions: Claude Code, Gemini CLI, Codex, OpenCode) or in
  dollars (paid APIs). Change or remove it any time: the budget button in the project chat header,
  or the agent's card on the Agents page. The orchestrator can propose one, with approval.
- Replies and the chat header show tokens; the dollar figure is an estimate at API prices, shown
  only as a hint.

## [0.19.0] - 2026-10-27: Network per agent

- Each agent can have its own allowed hosts (Agents page → Network), on top of the shared list or
  instead of it, so a tracker's address goes only to the agent that works with the tracker.
- WebFetch can be limited to the same hosts.
- Agents running at the same time each get their own list in the command sandbox.
- The orchestrator can propose an agent's hosts (with approval); the host check on the Integrations
  page says which agents may reach a host, and an agent's card warns when its variables point to a
  host it cannot reach.

## [0.18.0] - 2026-10-27: Side panel and apps

- Side panel next to the chat: open any extension there with **Apps**; it knows the chat and
  project it is next to.
- Project apps: pin an extension to a project (or ask the orchestrator for one) and it opens by
  itself in the project chat.
- Extensions can keep their own data, reach approved hosts through Aura with keys filled in by
  Aura (never visible to them), ask an agent on your behalf (within budgets, rate limited), and
  read project files. Each is a permission shown before install.
- Forms and buttons for agents' extensions, styled with the current theme.
- Extension icons, and a Navigation list on the Customize page to order and hide the rail's icons
  (also by asking the orchestrator).
- Removing an extension also deletes its data.

## [0.17.0] - 2026-10-27: First alpha

The first public build: phases 10 to 17 on top of 0.9.0. Unsigned installers; see the
[alpha notes](docs/ALPHA.md) for requirements and known limits.

From the first test of the alpha:

- More kinds of integrations: MCP servers at a URL with headers (keys as secrets), and variable
  sets that give a service's address and token to several agents' commands (CLIs and scripts).
- A stored secret is offered wherever variables are edited, and a server test that sees the
  server ask for a stored secret it did not get says so and offers to give it.
- A command server can share its variables with its agents' commands, so a script for the same
  service works without setting them twice.
- Extensions can be removed (one commit, so they can be restored).
- Scheduled jobs and the orchestrator can post into the alerts chat.
- The orchestrator has its theme, extension, MCP and catalog tools in every chat, and says it sent
  an approval card only after the tool confirms it.
- The orchestrator knows Aura: the user guide is built in (`aura_docs`), its instructions describe
  the app's pages, chats and settings, and it can add an agent to a project and propose changes to
  an agent's tools, variables or instructions (with approval). Agents say what they miss instead
  of claiming they changed their own setup.

- Agents never stay silent without a reason: mentioning an agent outside the chat says where it is,
  and an empty model answer shows as an error.
- Integrations page: add, edit, test and remove MCP servers, bind them to agents, and see why a
  server fails (plain-language error and its log).
- Secrets stored by Aura (outside git, never shown again) and used as `${secret:NAME}`; no more
  `~/.profile` for keys.
- Variables for an agent's commands, on every engine and in containers; secret values are hidden in
  chat.
- Agents page: engine readiness, tools the engine lacks, variables, tool servers, chats, last error
  and what stops the agent; tools and variables editable there.
- Host check (reachable? may commands reach it?), proxy settings passed to commands and servers.
- The orchestrator can inspect the setup (read-only, no secrets) and test a server.

- MCP servers in project containers: in a container project, agents' MCP tool servers that run
  as a command start inside the project's container, with secrets passed as environment.
- Fix: the agent runtime no longer reports idle while it is still deciding who answers a message.

- Project containers: a project can run its agents' shell commands in its own Docker or Podman
  container that sees only the project folder (no capabilities, memory/CPU/process limits, optional
  network). Switch it in the project chat header; defaults on the Engines page.

- Long chats: older messages are folded into a rolling summary per chat, so agents keep earlier
  decisions. Open it from the chat header, clear it, or turn summaries off on the Memory page.

- Catalog: packs of agents, skills, themes, CSS snippets and panel extensions. Six built-in packs
  (dev team, writing team, research, on-call, themes, alerts panel), or a pack from a GitHub link.
  A preview shows every file with diffs and warnings; installing is one git commit. The
  orchestrator can offer a pack as an approval card.

- Command sandbox: shell commands of Claude Code and Aura's own agent run in an OS sandbox
  (bubblewrap on Linux, Seatbelt on macOS): writes only in the project, no credentials, network only
  to allowed hosts; modes Auto / Required / Off on the Engines page.
- Fix: with the sandbox on, writes inside the project were refused as "outside the workspace".
- New logo: an aura drawn as layers around a light core.

- Conversation flow: typing `@` (or `/` at the start) suggests the chat's agents; replying to an
  agent's message wakes that agent; a message that starts with an agent's name goes to it; anything
  else in a project goes to the orchestrator, which passes it to the right agent. The composer shows
  who will answer before you send. Messages in the alerts chat are answered by the orchestrator.

- Agent memory: agents remember notes across runs (their own, and shared per project) and get the
  relevant ones in every run; keyword search in any language, optional semantic search with a local
  embedding model; Memory screen to review and delete notes.
- Fix: skills attached to an agent now reach its instructions (they were never added since 0.4).

- Project page: README, wiki (published from `docs/wiki`), license, contributing and security
  guides, issue and pull request templates.
- CI (typecheck, lint, tests, sidecar smoke test) and release builds for macOS, Windows and Linux.
- App icon and bundle metadata.

## [0.9.0] - 2026-10-27: Agent engines

- Engines page: choose what runs your agents, for all agents or per agent.
- Gemini CLI, Codex and OpenCode as engines over the Agent Client Protocol, under their own logins;
  Aura decides their permission requests and serves file access inside the project.
- Aura's own agent loop on OpenRouter (free models), Ollama and any OpenAI-compatible server, with
  built-in file, search, shell and web fetch tools and the agent's MCP servers.
- App tools reach external agents through a per-run MCP endpoint.
- Local model handling: hidden `<think>` reasoning, capped tool output, context-length hint.
- New look: cool surface, one blue accent, rounded shapes.

## [0.8.0]: Visual identity

- Aura's own design instead of a messenger clone: navigation rail, agent marks, run cards.

## [0.7.0]: Phone

- The web app served to phones, pairing with a one-time code, device tokens, Web Push notifications.

## [0.6.0]: Customization by chat

- Themes and CSS snippets with Try it, MCP servers per agent, sandboxed panel extensions, safe mode.

## [0.5.0]: Alerts and schedules

- Webhook alerts with deduplication and orchestrator triage; recurring jobs.

## [0.4.0]: Approvals, skills, tasks

- Approval cards for side effects, versioned skills with rollback, project tasks.

## [0.3.0]: Agents and projects

- Agents as files, projects as chat + git workspace + budget, guards (chain depth, budgets).

## [0.2.0]: Orchestrator

- The orchestrator on the Claude Agent SDK under the user's own Claude Code login.

## [0.1.0]: Chat core

- Chats, realtime over WebSocket, markdown, automatic local session.

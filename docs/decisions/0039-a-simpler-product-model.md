# 0039: A simpler product model, one Settings app

- Status: accepted
- Date: 2026-10-30
- Phase: 38 (replaces "Helpers" in ADR 0034's plan)

## Context

Aura grew phase by phase, and each phase added its own page, store or concept. The user now meets
too many of them, and the same thing is set up in several places:

- **A model** is chosen on Helper programs (the default and "Per agent"), on the Helpers page (an
  agent's engine), in the first-run panel (a free key), and in the built-in local AI card.
- **An agent** is spread over Helpers (role, tools, prompt, variables), Skills (its know-how), Memory
  (its notes), Tool servers (inside Helpers) and Helper programs (its engine).
- **Settings** are seven apps: Look, Language, Phone, Backups, Ready-made packs, Helper programs, and
  the built-in app switches in a New window.
- **Two kinds of app.** Apps built in Aura live in `projects/<id>` with a chat; panel extensions from
  packs live in `extensions/<id>` without one. Both run in the same frame with the same API.
- **Three kinds of group chat.** A project (chat, folder, team, limit, tasks), a group the user makes
  (chat and helpers), and an app's chat. They differ in what is behind them, not in how they work.
- **Three secret stores.** Engine keys (`state/secrets.json`), agents' secrets (in the same file,
  another shape) and apps' secrets (`state/app-secrets.json`).
- **Reminders and alerts** are their own apps, but each only posts into a chat.
- On the server, `customize` (3.2K lines) holds appearance, themes, extensions, the frame runtime,
  tool servers and safe mode; `agents/tools.ts` (870 lines) holds tools of six domains; `engines`
  and `agents/setup` both decide which engine an agent runs on.

## Decision

### Five things the user deals with

1. **Chats.** Your chat with the Helper, groups, and Alerts. A **group** may have a **folder** (what
   a project is today: a git workspace, tasks and a limit). "Project" stops being a separate kind:
   it is a group with a folder, made by the Helper or by "New group → with a folder".
2. **Apps.** One kind: code that opens in a tile, with a chat to use and change it. Panel extensions
   become apps (moved to `projects/<id>`, given a chat). The bar app stays an app.
3. **Helpers.** One card per helper holds everything about it: role, **which AI** it uses (from the
   connected ones), its instructions, what it **knows** (skills), what it **remembers** (memory),
   what it may **use** (tools, tool servers, variables), and its limit.
4. **AI.** Where models come from: free services, the built-in local AI, agent apps. Connected once;
   every helper picks from them.
5. **Settings.** One app with tabs:
   - **AI**: connections and the default model. Nothing per helper here.
   - **Helpers**: the team; the helper card above; the shared skill library.
   - **Automations**: reminders (scheduled messages into a chat) and alert sources (webhooks).
   - **Look**: theme, windows, bar, language.
   - **Data**: backups of apps, restore points, ready-made packs.
   - **Advanced**: tool servers, the command sandbox, safe mode, turning built-in parts off.

"My apps" then lists: Chats, Settings, and the user's apps. Skills, Memory, Reminders, Helper
programs, Look, Language, Backups and Ready-made packs stop being apps of their own.

### The phone is hidden

Pairing, device tokens, the `/app` web client and push stay in the code and in the docs for later,
but the Phone item, its settings and `AURA_REMOTE` are off in the interface.

### Behind it

- **One secret store** (`state/secrets.json`, 0600) with scopes: `engine:<id>`, `agent` (shared
  agent secrets), `app:<id>`. The old files are read once and moved.
- **Server modules by domain:** `ai` (engines, local AI), `helpers` (profiles, runtime, prompt,
  skills, memory, setup), `chats` (chats, topics, groups and folders, tasks, files, summaries),
  `apps` (apps, the frame runtime and bridge, data, actions, packs, the bar), `automations` (jobs,
  alerts, webhooks), `system` (settings, appearance, language, backups, restore points, layout,
  modules, auth, devices, help, realtime). Agent tools live with the domain they act on.
- **Optimization:** engine statuses are cached for a short time instead of checked on every page
  load; spending is summed in one query for all projects; the frame runtime and kit are built once.
- The message protocol, the chat kinds (direct, group, system), the approval rules and the loop
  guards do not change.

### Order

1. **Settings and the helper card** (interface only, no data changes): the Settings app with tabs,
   the helper card with its AI, skills and memory, the phone hidden, My apps reduced.
2. **Server by domain**, one secret store, the optimizations; the API keeps its shape for the client.
3. **Model changes with migrations**, each on its own commit with tests and a backup first:
   projects become groups with a folder, extensions become apps, reminders move into Automations.

## Progress

- Stage 1 done (0.40), trimmed further by ADR 0040 (0.41).
- Stage 2 done: one secret store (`state/secrets.json`, version 2), engine statuses kept for 15 s,
  spending summed in one query, the frame runtime built once, the server's modules grouped by
  domain, and agent tools living with their domain (`helpers/agents/tool-kit.ts` holds what they
  share).

## Consequences

- CLAUDE.md rule 2 keeps three chat kinds; "a project" becomes "a group with a folder" in the
  docs, and the built-in apps that can be turned off are Chats and Alerts (skills, memory and
  reminders are parts of helpers and automations).
- ADRs 0020, 0027, 0030 and 0034 are partly replaced; the wiki is reorganized around the five things.
- Existing data folders are migrated in place by the server on start, after a restore point.

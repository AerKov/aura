# 0024: Aura as a shell for apps

- Status: accepted
- Date: 2026-10-28
- Phase: 21 onwards

## Context

Aura grew as a messenger: everything happened in chats, and apps (extensions) were panels next to
them. Seen from the user's side, the messenger is only one of the things they want on screen. They
want their own tools (a CRM, a board, a dashboard), written by them with agents or installed from
the community, and a way to use and change each tool by talking to agents about it.

## Decision

Aura becomes an invisible layer that runs and orchestrates the user's apps.

- **Shell.** Aura opens on a bare screen where one or more apps are laid out as tiles (splits and
  tabs, like a tiling window manager). The layout is saved and restored. There is no desktop of
  icons; the rail opens apps and layouts.
- **The messenger is an app.** Chats with the orchestrator and agents are the first app; it can be
  customized like any other. On first launch it fills the screen with the orchestrator, which
  explains Aura (onboarding). From then on the user changes the layout by asking the orchestrator
  or by clicking.
- **Every app has one chat, with topics.** Like forum topics in Telegram: a chat has "General"
  plus topics the user creates ("Customization", "Work", …). A topic shows only its messages, and
  agents see only the topic they are in. Messages can be moved to another topic afterwards. In the
  app's chat the user both uses the app ("add client X") and changes it ("add a source column").
- **An app is a project whose workspace holds its code.** Agents, budgets, network rules, git
  history and approvals work as for projects. Changes to an app's code are shown as a diff, need
  approval, are one commit each, reload the app live, and can be rolled back.
- **App data is the app's own, where the user decides.** Never in Aura's main database. At install
  (and later) the user picks the app's own database (a separate SurrealDB datastore per app, with
  live queries) or files in the app's folder (versioned in git). Each app's data can be exported,
  backed up and deleted on its own.
- **Apps talk through contracts on both sides.** An app's developer declares what other apps may
  call (actions, exposed like MCP tools) and what it may read; nothing else is reachable. The user
  then grants a specific app the right to call specific actions of another, as a permission shown
  on a card. Agents use the same actions in the app's chat.
- **Community apps** come from the catalog; once installed they are the user's to change in their
  chat. Updates from the author arrive as a merge with the user's changes, never as an overwrite.

## Consequences

- CLAUDE.md rule 2 changes: chats gain topics (one level, like Telegram forum topics; still no
  nested threads, replies stay). Rule 3 gains: app data lives in the app's own store.
- The current extension API (ADR 0021) is the base of the app runtime: sandboxed frames,
  permissions, storage, network through approved hosts, asking agents.
- The roadmap continues with phases 21-27 in docs/SPEC.md: shell, topics, apps with chats, app
  data, actions and contracts, app kit, community apps.

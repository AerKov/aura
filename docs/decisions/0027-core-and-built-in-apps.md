# 0027: The core and its built-in apps

- Status: accepted
- Date: 2026-10-28
- Phases: 28, 29

## Context

Alpha feedback on 0.27: opening an app kept adding tabs nobody needed, a project's app opened by
itself next to its chat, and the chat was still the centre of the program. Not every user wants to
build apps with agents; some only want to use the apps they installed. Aura should be a core you
fill with apps, where chats, skills and memory are apps like any other.

## Decision

- **The core** is what is always there: SurrealDB, sessions and devices, the shell and its layout,
  the app runtime (frames, app data, actions), the catalog, approvals (apps' side effects go through
  them) and appearance.
- **Built-in apps** can be turned off on the Home shelf: Chats (the messenger, the orchestrator,
  agents, engines, projects and tasks, every app's chat), Skills, Memory, Schedule, Signals
  (alerts) and Integrations. Skills, Memory, Schedule and Signals need Chats: turning Chats off
  turns them off, turning one of them on turns Chats on.
- **Off means off on the server.** A turned-off app's routes answer 404 before anything else runs,
  no message wakes an agent while Chats is off, due jobs wait while Schedule is off, and agents lose
  the tools and prompt parts of Skills, Memory and Integrations. It takes effect at once, without a
  restart.
- **Config in a file.** `modules.json` in the data folder lists the apps that are off; each change
  is a commit. A missing file means everything is on.
- **No tabs.** A tile shows one app. Clicking an app replaces the focused tile's app, or focuses the
  tile that shows it; Shift-click or **+** opens a new tile. Saved layouts with tabs keep each
  tile's active app.
- **Home.** An empty screen (and a new install) shows the Home shelf: your apps, **Add an app**
  (templates, the catalog, an empty app for @builder when Chats is on), the built-in apps with their
  switches, and a short welcome card.
- **An app's chat is inside the app.** Its **Chat** button opens the chat as a panel inside the
  app's tile. Nothing opens by itself next to a chat; a chat's **Apps** button opens the app beside
  it when the user asks.

## Consequences

- A user can run Aura as a plain app shelf, with no agents at all.
- Apps installed while Chats is off still get their chat; it shows up when Chats is turned on.
- New built-in features must name the app they belong to (routes, tools) or they are core.

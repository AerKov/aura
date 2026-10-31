# 0042: Aura is for building your own apps by chat

- Status: accepted
- Date: 2026-10-31
- Phase: 39 (replaces much of ADR 0013, 0014, 0016, 0017, 0018, 0024, 0027, 0028, 0029, 0031,
  0033, 0034, 0035, 0039, 0040 and 0041; see "Superseded" below)

## Context

Aura had grown into a messenger, an agent team runner, a monitoring inbox, a scheduler, a window
manager, a catalog of packs, a phone client and an app shell at once: about 50,000 lines and a
dozen settings pages. The idea that matters to the user fits in one sentence: **build your own apps
locally, by talking to a helper.** Everything that did not serve that sentence made Aura harder to
understand, to test and to change.

## Decision

Aura keeps:

- **The Helper's chat** (the one direct chat). The user says what they want; the Helper proposes an
  app with `create_app`, answers questions from the guide, changes the look and the language.
- **Apps.** Each app is a git folder under `projects/<id>` with its code, its own data store
  (a database or files), its own secrets, its permissions in a sandboxed frame, and **its own chat
  with @builder**. Every change is a diff the user approves; every version can be restored.
  A plain message in an app's chat goes to its only helper, @builder.
- **Approvals** for every side effect, the agent loop guards (chain depth, budgets) and the
  read-only core (CLAUDE.md rules 6, 8, 9).
- **The AI:** the built-in llama.cpp, Ollama, LM Studio or any OpenAI-compatible server, and
  Claude Code under its own login. Settings → AI picks one for the Helper and one for @builder.
- **History:** an uninstalled app leaves a backup that Settings → History brings back.
- **The look** is a theme file of the user's (ADR 0041), changed by asking. The language too.

Aura drops:

- Agent engines over ACP (Gemini CLI, Codex, OpenCode) and MCP tool servers.
- The phone client, pairing, Web Push and listening on the LAN.
- The catalog of packs.
- Alerts, webhooks, schedules and the system chat.
- Groups the user makes, projects with a team, tasks, chat topics and project budgets in the UI.
- Skills, memory and chat summaries; agents' own variables and secrets.
- Whole-Aura restore points (app versions and the uninstalled-apps backups stay).
- The tiling window manager, the bar and the bar app, the Start menu, Home, shortcuts and
  replaceable built-in apps.

**The screen** is one glass sidebar (the Helper, the apps, **New app**, Settings) and beside it one
thing: the Helper's chat, an app with its chat beside it (it can be folded away), or Settings. The
screen opens where the user left it (kept in the browser's storage, a per-viewer convenience).

**The default look** is modern and soft: Geist, 16px corners, gentle shadows, a slowly drifting
aurora of three colours behind glass panels, gradient bubbles and buttons, an orb on empty chats,
and spring animations. All of it is theme variables (`--aurora-1..3`, `--radius`, `--ease`,
`--sidebar-*`, `--app-*`, `--bubble-own`…), so the Helper can change it; `prefers-reduced-motion`
stops the motion.

## Consequences

- Old data keeps working: messages lose their topic and show in one stream; the old alerts chat is
  deleted on start; apps that asked for `ui.bar` or `replaces` show a problem until @builder fixes
  their manifest. Removed tables (topic, job, memory, summaries) are left alone or dropped.
- Two engines' worth of code, the phone and the automations are gone: roughly 15,000 lines less,
  and every remaining part serves building and using apps.
- New ideas go to an app of the user's first; the core grows only when apps cannot do it.

## Superseded

ADR 0013 (memory), 0016 (MCP), 0017 (summaries), 0018 (schedules), 0028 (tiling), 0029 (bar app),
0031 (alerts from apps) are withdrawn. ADR 0014 (one addressee) gains "the chat's only helper".
ADR 0024, 0027, 0033, 0034, 0035, 0039, 0040 and 0041 hold only where they describe apps, their
chats, approvals, versions, data, secrets and the theme file.

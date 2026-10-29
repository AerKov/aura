# 0033: Aura as a shell: a launcher, uninstall with a backup, restore points, libraries, Localization

- Status: accepted
- Date: 2026-10-29
- Phase: 35

## Context

Feedback on 0.31 (WISH-10, WISH-11): Aura should feel like a shell for apps, with a launcher like
the Start menu, groups and a description for every app; apps should install and uninstall
conveniently with a backup; the user wants to roll the whole Aura back (and forward again) after
customizing it through the orchestrator; apps should not be limited to a fixed set of components;
and a separate Localization app should set the language of Aura and its apps.

## Decision

- **Launcher.** Home lists every app by group with a one-line description and a search box.
  Built-in apps are described in `BUILTIN_APPS` (`packages/shared/src/apps.ts`) in the groups
  Communication, Agents and System; an app's manifest gives `description` (one line) and `group`
  (free text; none means "Apps"). The user's groups come first. Built-in modules keep their switch;
  the user's apps get a menu with Uninstall.
- **Uninstall with a backup** (`apps/lifecycle.ts`). An app's archive is `meta.json` (name, data
  store, what was granted), `code/` (its folder with its git history, without the files store) and
  `data.json` (a dump of its store, either kind). Uninstalling writes the archive and the chat as
  `chat.md` to `backups/apps/<id>-<time>`, then removes the app, its chat (messages, topics,
  schedules, waiting approvals; runs stay as spend history), its data, grants and secrets. Bringing
  it back creates the app with a new chat and puts back code, versions, data and grants. Secrets
  are never in a backup. A pack whose apps were all uninstalled can be installed again.
- **Restore points** (`backups/restore-points.ts`, a core module). A point holds the data dir's
  configuration (every top-level entry except `.git`, `state`, `projects`, `backups`,
  `restore-points`), an archive of every app, and the `setting` rows (appearance, layout,
  language). Going to a point first saves the present as an automatic point (the last 10 are kept),
  so the user can come forward again; apps made since are uninstalled with a backup; config
  changes are one commit; services re-read their cached files. Chats, runs, memory and secrets are
  not part of points. The orchestrator can list and save points freely; going to one is an
  approval card (`restore_point`).
- **Libraries.** An app lists files under `lib/` in its manifest `libraries`; the frame inlines
  `.css` and classic `.js` (UMD/IIFE, a global) before `main.js`, and `.mjs` modules load with
  `ctx.lib(path)` from memory, since the frame has no network. `add_library` (agents in an app's
  chat) fetches an exact npm version from jsDelivr into `lib/`, at most 2 MB a file and 6 MB per
  app. The change card lists library files and the manifest line instead of their code.
- **Localization** (a core page). The choice ("auto", "en", "uk", or a file's code) is a setting.
  Agents answer in the chosen language (its English name in the prompt) instead of following the
  user's messages; apps get `ctx.language` and their frame reloads on a change; the shell
  translates its texts with `useT()` keyed by the English text, falling back to English. More
  languages or corrections are `locales/<code>.json` files in the data dir.

## Consequences

- Translation coverage grows over releases; `uk.test.ts` checks that every text the shell passes
  to `t()` has a Ukrainian entry.
- Restore points copy files; large app data makes them large. They live outside git and outside
  backups of config.
- Fetching a library is the only network use added, server-side, on an agent's tool call, and the
  result is shown to the user before it runs.

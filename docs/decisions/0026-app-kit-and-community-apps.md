# 0026: App kit, templates and community apps

- Status: accepted
- Date: 2026-10-28
- Phases: 26, 27

## Context

Agents writing apps from raw DOM make mistakes and every app looks different. Users want to start
from something that works (a CRM, a task board, notes) and install apps others made, then keep
changing them in their chat without losing those changes when the author ships a new version.

## Decision

- **App kit.** A small library in every app frame, `ctx.kit`: `form`, `table`, `board`, `cards`,
  `chart`, `stat`, `tabs`, `row`. Each is bound to a collection (ADR 0025), builds itself from the
  collection's schema, uses the theme's variables, and refreshes on `data.changed`. It is plain
  JavaScript embedded in the server (`kit.js.txt`), so it works offline and in the sidecar. Forms use
  buttons rather than `<form>` submit (sandboxed frames cannot submit); deleting asks inline.
- **Templates are packs.** CRM, Tasks and Notes are built-in catalog packs whose content is an app
  (`apps/<id>/manifest.json`, `main.js`, `styles.css`). **+ → New app** offers them next to an
  empty app; the orchestrator can install them from the catalog.
- **Apps in packs.** A pack's `apps/<id>/…` files are not written into the data folder: installing
  creates the app (a project with its chat and @builder, ADR 0024) and an `upstream` branch with the
  author's version. Packs from a link work the same, so community apps are packs.
- **Updates merge.** Installing a newer version of the pack commits the author's files on
  `upstream` (in a temporary worktree, so the user's working copy is untouched) and merges it into
  the app with `-X theirs`: the user's changes stay; where both changed the same lines, the author's
  version is used. The pack preview says so, and the app's versions can restore the user's. An
  update waits while the app has a change waiting for approval.

## Consequences

- An app installed from a pack and then changed by its chat stays updatable.
- Merge conflicts never block an update, at the cost of the author winning on conflicting lines;
  this is visible in the preview and reversible.

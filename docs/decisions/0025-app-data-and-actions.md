# 0025: App data and actions

- Status: accepted
- Date: 2026-10-28
- Phases: 24, 25

## Context

Apps built in Aura (ADR 0024) need data of their own, and the user wants it apart from Aura's main
database, in a form they choose. Agents in an app's chat should be able to work with the app
("add client X"), and apps should reach each other only through what both sides agree to.

## Decision

- **Store per app, chosen by the user.** Its own embedded SurrealDB datastore
  (`state/apps/<id>`, default) or JSON files in the app's folder (`data/`, kept out of its code
  versions by `.gitignore`). The user switches on the app's tile (the data moves), exports it as
  JSON, or deletes it. Nothing of an app's data is in the main database; the app's `storage`
  key-value API is kept in its store too. The choice itself is config on its project row.
- **Collections with an optional schema** in `manifest.json` (`string`, `number`, `boolean`,
  `date`, `json`, `?` for optional). With collections declared, only those exist and records are
  checked. Filtering, search and sorting run in memory: personal apps are small (10,000 records per
  collection at most).
- **Live changes.** Every write announces `app.data`; the app's frame gets `data.changed`, so a
  change made by an agent shows at once.
- **Declarative actions.** An action is `kind` (`list`, `get`, `count`, `insert`, `update`,
  `delete`) over a collection, with a description. They run on the server without the app's frame,
  so agents can use an app that is not open. Agents in the app's chat get them as tools
  (`app_<name>`); `delete` asks the user first. Scripted actions may come later.
- **Contracts on both sides.** The app's developer lists in `provides` which actions other apps may
  call. A calling app declares `uses` (`app.action`) and the `apps.call` permission; the user sees
  both on the card, and the calls are granted with it. A call needs both: offered by the target now,
  and granted to the caller.

## Consequences

- An app's data survives restoring an older version of its code (data is not in its versions).
- Moving to files makes the data readable and copyable, not versioned.

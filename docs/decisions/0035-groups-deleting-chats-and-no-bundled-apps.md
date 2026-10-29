# 0035: Groups of your own, deleting chats, secrets in the app, no bundled apps

- Status: accepted
- Date: 2026-10-29
- Phase: 37 (follow-up)

## Context

After trying phase 37 the user found gaps: only the orchestrator could make a group chat (through
a project), a chat could not be deleted and it was unclear how to delete a project, the limits of a
project had slipped into advanced mode, an app's secrets sat in a place that was easy to miss,
a helper's mark in a chat led nowhere, the window presets were named after other programs, and the
catalog offered sample apps (CRM, Tasks, Notes) nobody asked for.

## Decision

- **A group is a chat of its own** (`POST /chats {title, agents}`): a name and the helpers the user
  picks; the orchestrator is always in it. It is a `group` chat without a project, so there are
  still only three chat kinds (ADR 0027). It sits under "Groups" in the chat list and takes
  "+ Helper" like any group chat. "New group" is at the top of the chat list.
- **Any group chat can be deleted** (`DELETE /chats/:chatId`) from a button in its header, after a
  question. A group goes with its messages, topics, reminders and waiting decisions. A project's
  chat also removes the project; its files move to `backups/projects/<slug>-<time>`, never deleted.
  An app's chat goes only with the app (uninstall, which keeps a backup). The chat with the Helper
  and the alerts stay. A chat where a helper is working cannot be deleted.
- **Limits are back** in a project's chat header in plain mode too (tokens, dollars or none).
- **Secrets belong to the app.** The key button sits next to the chat button on the app's tile and
  shows when the manifest names secrets. @builder lists only the names in the manifest and tells
  the user to enter the values there; it never asks for a value in a chat. Customize no longer lists
  an extension's secret names.
- **A click on a helper's mark** in a chat opens the Helpers app on that helper.
- **Window presets** are "Airy" and "Compact"; the interface and docs no longer name other window
  managers.
- **No bundled apps.** The catalog drops the CRM, Tasks and Notes packs; apps come from @builder or
  from a URL, and are added to the catalog separately later. Agent, skill and theme packs stay.

## Consequences

- Tests that used the bundled app packs serve an app pack over a fake web server instead.
- ADR 0034's tile, chat list and card design are unchanged.

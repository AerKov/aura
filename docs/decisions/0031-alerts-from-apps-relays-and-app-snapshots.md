# 0031: Alerts from apps, messages relayed by the orchestrator, app snapshots for agents

- Status: accepted
- Date: 2026-10-28
- Phase: 33

## Context

Feedback on 0.31: a test or monitoring app needs to publish a real alert card (WISH-7); the user
wants the orchestrator to pass a message into another chat (WISH-8); @builder changed apps blind and
needed several approve-and-check rounds (WISH-2).

## Decision

- **`alerts.write`** (a new app permission) and `ctx.alerts.post({ severity, title, summary,
  fingerprint? })` create an alert card through the same pipeline as monitoring webhooks: the source
  is `app:<id>`, repeats bump the count, warnings and critical alerts wake the orchestrator within
  its hourly triage limit. At most 30 posts an hour per app; the route belongs to the Signals module
  and answers 404 while it is off. The permission and its scope show on the approval card like any
  other.
- **`post_to_chat`** (orchestrator): posts into a chat it is a member of (`list_my_chats`) only when
  the run answers the user's own message (`byUser` in the tool context: not an agent, an alert or a
  schedule). The message is the orchestrator's, with a line saying it was sent at the user's request
  and from which chat. `message_project` stays for the orchestrator's own routing of alerts and
  schedules.
- **`app_snapshot`** (agents in an app's chat): the server publishes `app.snapshot` over the
  WebSocket; the first client showing the app asks its frame, which builds a text outline of its
  page (headings, buttons, fields, tables, text) with its size and last errors and sends it back.
  The answer says whether the live version or the draft was shown; with no client showing the app in
  6 seconds, the agent is told to ask the user to open it (and to preview the draft). The outline is
  the app's content and is given to the agent as data.

## Consequences

- An agent sees only what a user's open frame shows; there is no headless rendering on the server.
- Relayed messages never come from an agent's own initiative.

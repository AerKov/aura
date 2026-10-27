# 0021: Side panel, project apps and extension API v2

- Status: accepted
- Date: 2026-10-27
- Phase: 18

## Context

Alpha feedback, from the user and from the orchestrator itself:

- Extensions could only be full pages in the rail, away from the conversation.
- They had nowhere to keep data except messages in a chat.
- They had no network, so a panel for an outside service (a tracker, a status page) was impossible.
- They could not ask an agent to do something, so "a form that files a ticket" needed the user to
  retype it in the chat.
- They had no icon, and the rail could not be arranged.

## Decision

- **Side panel.** Any enabled extension with `ui.panel` opens in a panel to the right of the chat
  (Apps button in the chat header), with the chat and its project as its context
  (`ctx.context()`, the `context` event). Forms and buttons from agents live only there or on the
  extension's own page; they never appear inside messages.
- **Project apps.** A project can pin one extension as its app (`project.app`). It opens by itself
  when the user enters the project chat; closing it is remembered per chat for the session. The
  user pins from the panel header; the orchestrator can propose an extension for a project
  (`propose_extension` with `project`), and approving the card installs and pins it.
- **New permissions**, each shown on the install card and granted with the others at install or
  enable time. A later manifest edit does not widen what was granted:
  - `storage`: a key-value store per extension in the database (`extension_data`), 256 KB a value,
    1000 keys, deleted with the extension.
  - `net`: requests through the server to the hosts in the manifest's `hosts` only (exact names,
    `host:port`, or `*.domain`). No redirects are followed. A header or URL may contain a secret
    reference for a name listed in the manifest's `secrets`; the server fills it in from the
    user's stored secrets and replaces its value with `[secret]` in the answer. The frame itself
    keeps `connect-src 'none'`.
  - `agents.ask`: posts a message from the user, `@agent text`, in the current chat. It goes
    through the normal routing, so the agent must be in the chat, and budgets and chain depth apply.
    At most 10 a minute per extension.
  - `files.read`: lists and reads files of a project (the current one by default), read-only, at
    most 1 MB a file, never `.git`, and symlinks cannot lead outside the project.
- **Icons.** The manifest may name one icon from a fixed list (`EXTENSION_ICONS`); no images or
  remote fetches.
- **Rail layout.** The user orders and hides rail items on the Customize page; it is stored with
  the appearance (`rail.order`, `rail.hidden`) and the orchestrator can change it with
  `set_appearance`. Chats and Customize cannot be hidden.
- **Helpers in the frame.** `ctx.ui.form` and `ctx.ui.button` build themed controls, so agents
  write less code. Sandboxed frames cannot submit forms, so the helpers use buttons and validate
  fields themselves.

## Consequences

- Every bridge call is checked twice: by the app for the frame, and by the server for the session.
- An extension never holds a key: secrets stay on the server, as with MCP servers (ADR 0020).
- `agents.ask` spends budget on the user's behalf; the permission says so, and the rate limit and
  budgets bound it.
- Extensions that use the new permissions need app 0.18.0 (`minAppVersion`).

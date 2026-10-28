# Agents

The **Agents** page (the robot icon) is everything about your agents in one place: what each one
runs on, its tools and variables, its tool servers, its chats, its budget, the last error and what
stops it from working; then the tool servers (MCP) and the secrets agents use.

## An agent's card

Pick an agent at the top. Its card shows:

- the **engine** and model it runs on, and whether that engine is ready;
- its **tools** (Read, Write, Bash…); a tool its engine does not provide is marked;
- **variables for its commands**: an address, a token for a command-line tool (`gh`, `psql`, your
  own script). Keys go in as secrets;
- its **budget**, its **tool servers** and its **chats**;
- **warnings**: what stops it, in plain words (an engine that is not ready, a variable with no
  value, no chat yet, the last error).

Changes apply from its next reply. Agents' shell commands run in the
[command sandbox](Approvals-and-Safety): only in the project folder, no credentials, and **no
network**. Agents reach the web through their engine's own web tools (WebSearch, WebFetch).

## Tool servers (MCP)

An MCP server gives agents new tools: a tracker, a database, an internal API. Under **Tool servers**,
click **Add server** and give:

- a **name**, for example `tracker`;
- **a command** that Aura starts on this computer, with its arguments and **variables**; or
- **a URL** of a server that already runs, with **headers**. A key goes into a header such as
  `Authorization: Bearer ${secret:SERVICE_TOKEN}`. The key buttons under the headers fill this in;
- the **agents** that get its tools.

Press **Test**. Aura starts or contacts the server once and lists its tools; if something is wrong,
it says what in plain words (command not found, a variable without a value, refused credentials, no
answer) and shows the server's log with secrets hidden.

A command server can also **give its variables to its agents' commands**, so a CLI for the same
service works with the same address and key. Aura does not read the servers set up in Claude Code
(`claude mcp list`); add them here.

## Secrets

Agents' keys and passwords live in Aura's own store, `~/.aura/state/integration-secrets.json` (the
name is older than this page). Only your user can read it, it is never committed, and the app never
shows a value again. A secret does nothing on its own: give it to a tool server or an agent's
variables, where your secrets appear as one-click buttons. In files they appear as `${secret:NAME}`.

Agents are told variables' names, never their values, and secret values are replaced with `[secret]`
in what they write to the chat.

**Apps keep their own secrets**, apart from agents': see [Apps](Apps).

## Asking the orchestrator

The orchestrator can read how agents and their tool servers are set up (never secret values) and
test a server, so you can ask: "why does @coder not answer?". It can also propose a tool server or a
change to an agent; you approve it on a card.

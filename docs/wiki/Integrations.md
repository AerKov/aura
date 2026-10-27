# Integrations

The **Integrations** page (the plug icon) connects agents to the rest of your tools: issue trackers,
git hosts, databases, monitoring, chat, internal APIs. There are three ways to connect a service:

| Way                    | Use it when                                       | Example                                  |
| ---------------------- | ------------------------------------------------- | ---------------------------------------- |
| MCP server (a command) | the service has an MCP server you run locally     | `npx`, `uvx`, `python3 server.py`        |
| MCP server (a URL)     | the service hosts an MCP server                   | `https://mcp.example.com/mcp` with a key |
| Variables for commands | agents use a command-line tool or your own script | `gh`, `glab`, `psql`, `./sync.py`        |

All three keep keys under **Secrets** and are given only to the agents you choose.

## MCP servers

An MCP server gives agents new tools. Click **Add server** and give:

- a **name**, for example `tracker`;
- **a command** that Aura starts on this computer, with its arguments and **variables**; or
- **a URL** of a server that already runs, with **headers**. A key goes into a header such as
  `Authorization: Bearer ${secret:SERVICE_TOKEN}`. The key buttons under the headers fill this in
  for a stored secret;
- the **agents** that get its tools.

Press **Test**. Aura starts or contacts the server once and lists its tools. If something is wrong,
it says what in plain words: command not found, a variable without a value, refused credentials,
no answer. The server's own log is shown below, with secrets hidden. If the server asks for
variables that you stored as secrets but did not give to it, the test says so and offers **Give
them to this server**.

A command server can also **give its variables to its agents' commands** (on by default for new
servers): then a script or CLI for the same service works with the same address and key, without
setting them twice.

Changes apply from each agent's next reply. Nothing needs a restart. Aura does not read the
servers set up in Claude Code (`claude mcp list`); add them here.

In a [project that runs in a container](Approvals-and-Safety), command servers start inside that
container.

## Variables for commands

Agents often use command-line tools or scripts with `Bash`: `gh` or `glab` for a git host, `psql`
for a database, a tracker's CLI, or your own script. These need an address and a token. Under
**Variables for commands**, create a set (for example `git-host` with `GITLAB_URL` and
`GITLAB_TOKEN`) and pick the agents whose commands get it.

An agent can also have its own variables, on its card on the **Agents** page. When a name comes from
several places, the agent's own value wins, then a variable set, then a server that shares its
variables. The card lists every variable the agent gets and where it comes from.

Variables reach the agent's commands on every engine and in project containers. The agent is told
their names, never their values, and secret values are replaced with `[secret]` in what it writes
to the chat.

## Secrets

Keys and passwords live in Aura's own store, `~/.aura/state/integration-secrets.json`. Only your
user can read it, it is never committed, and the app never shows a value again.

**A secret does nothing on its own.** Give it to a server, a variable set or an agent: wherever you
edit variables, your stored secrets appear as one-click buttons. In files they appear as
`${secret:NAME}`. A variable whose name looks secret (`…KEY`, `…TOKEN`, `…PASSWORD`…) can only
be a secret, so a key never ends up in a file by accident.

You do not need `~/.profile` or a re-login. `${env:NAME}` still works for variables of the
environment that starts Aura.

## Check a host

Enter an address, for example a service behind your VPN. Aura tells you:

- whether this computer reaches it, or why not (unknown host, refused, no answer, certificate);
- whether agents' commands may reach it, and which agents.

Commands run in the [command sandbox](Approvals-and-Safety), which allows only listed hosts. To let
one agent reach an internal host (your tracker, say), add it to that agent's hosts on the **Agents**
page, card **Network**. To let every agent reach it, add it to the shared list on the Engines page,
card **Command sandbox**. MCP servers are not limited by these lists.

Proxy settings (`HTTPS_PROXY`, `NO_PROXY`…) of the environment that starts Aura are passed on to
agents' commands and MCP servers.

## Examples

**A tracker with a local MCP server.**
1. Secrets: `TRACKER_URL`, `TRACKER_API_KEY`.
2. Add server: command `python3`, argument `/path/to/tracker_mcp.py`. Under Variables, click both
   secrets. Agents: the one that manages tasks.
3. Test. It lists the tracker's tools.

**A hosted MCP server with a token.**
1. Secrets: `SERVICE_TOKEN`.
2. Add server: URL `https://mcp.example.com/mcp`, header button **Bearer SERVICE_TOKEN**.
3. Test.

**A command-line tool.**
1. Secrets: `GITLAB_TOKEN`.
2. Variables for commands: set `git-host` with `GITLAB_URL` (plain) and `GITLAB_TOKEN` (the secret),
   for `@coder` and `@reviewer`.
3. Agents page: make sure they have `Bash`. If the card warns that the sandbox blocks the host, add
   it on the Engines page.

## Asking the orchestrator

The orchestrator can read how agents and integrations are set up (never secret values) and test a
server, so you can ask: "why can't @coder reach our git host?". It can also propose an MCP server
or a change to an agent; you approve it on a card.

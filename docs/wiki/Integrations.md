# Integrations

The **Integrations** page (the plug icon) connects agents to your other tools: a tracker, a
database, an internal API.

## MCP servers

An MCP server gives agents new tools. Click **Add server** and give:

- a **name**, for example `redmine`;
- either a **command** that Aura starts on this computer (for example `/usr/bin/python3` with the
  argument `/home/me/redmine-mcp/server.py`), or the **URL** of a server that already runs;
- its **variables**: plain values like `REDMINE_URL`, or secrets (the key icon) like
  `REDMINE_API_KEY`;
- the **agents** that get its tools.

Press **Test**. Aura starts the server once and lists its tools. If it fails, Aura says why in plain
words: command not found, a variable without a value, refused credentials, no answer. The server's
own log is shown below, with secrets hidden.

Changes apply from each agent's next reply. Nothing needs a restart. Aura does not read the
servers set up in Claude Code (`claude mcp list`); add them here.

In a [project that runs in a container](Approvals-and-Safety), command servers start inside that
container.

## Secrets

Keys and passwords live in Aura's own store, `~/.aura/state/integration-secrets.json`. Only your
user can read it, it is never committed, and the app never shows a value again. Config files refer
to secrets as `${secret:NAME}`. A variable whose name looks secret (`…KEY`, `…TOKEN`,
`…PASSWORD`…) can only be a secret, so a key never ends up in a file by accident.

You do not need `~/.profile` or a re-login. `${env:NAME}` still works for variables of the
environment that starts Aura.

## Variables for an agent's commands

Scripts an agent runs with `Bash`, like `./redmine.py`, often need settings and keys too. Set them on
the **Agents** page, under "Variables for its commands". They reach the agent's commands on every
engine and in project containers. The agent is told their names, never their values, and secret
values are replaced with `[secret]` in what it writes to the chat.

## Check a host

Enter an address, for example your Redmine behind a VPN. Aura tells you:

- whether this computer reaches it, or why not (unknown host, refused, no answer, certificate);
- whether agents' commands may reach it.

Commands run in the [command sandbox](Approvals-and-Safety), which allows only listed hosts. To let
them reach an internal host, add it on the Engines page, card **Command sandbox**. MCP servers are
not limited by that list.

Proxy settings (`HTTPS_PROXY`, `NO_PROXY`…) of the environment that starts Aura are passed on to
agents' commands and MCP servers.

## Example: Redmine

1. Agents → `@redmine` → tools: `Bash`. Variables: `REDMINE_URL` = `https://redmine.example.com`,
   `REDMINE_API_KEY` as a secret, typed in once. Save.
2. Integrations → Check a host → `https://redmine.example.com`. If commands may not reach it, add
   `redmine.example.com` to the sandbox's allowed hosts.
3. Write to `@redmine` in a project chat it belongs to.
4. Or, instead of a script: add your Redmine MCP server here, bind it to `@redmine`, and press Test.

## Asking the orchestrator

The orchestrator can read how agents and integrations are set up (never secret values) and test a
server, so you can ask: "why doesn't @redmine answer?". It can also propose a new MCP server; you
approve it on a card.

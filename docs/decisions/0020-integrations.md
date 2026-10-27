# 0020: Integrations, secrets, agent variables and status

- Status: accepted
- Date: 2026-10-27
- Phase: 17

## Context

The first alpha user connected an issue tracker through an agent and got stuck at every step:

- MCP servers could only be added through the orchestrator, with no test.
- Keys had to be in `~/.profile`, which an app started from the menu does not see.
- Aura's own Bash stripped the environment, so scripts got no settings at all.
- The sandbox silently blocked the internal host.
- The tracker agent, mentioned in the direct chat, woke nobody, and nothing said so.
- Empty model answers showed as blank bubbles.
- Agents could not see the setup to help.

## Decision

- **Never silent.** A user's mention of an agent outside the chat posts where that agent is (or
  that it does not exist). An answer without text becomes an error naming the engine and model, or
  a note when the agent only used tools.
- **Integrations page.** The user adds, edits, removes and tests MCP servers, and binds them to
  agents. These are user actions, committed to the data repo; the orchestrator's proposal with
  approval still exists. The test starts the server once, lists its tools, and explains failures in
  plain words with the server's stderr. Servers are spawned per run, so changes apply without a
  restart. Claude Code's own MCP config stays unused (`settingSources: []`), as before.
- **Secrets.** Values live in `state/integration-secrets.json`: mode 0600, outside git, denied to
  sandboxed commands, absent from containers. The API returns names only.
  - Config files use `${secret:NAME}`, or `${env:NAME}` for the server's environment.
  - Names that look secret (`KEY`, `TOKEN`, `PASSWORD`…) cannot hold plain values.
  - `PATH`, `LD_*`, `AURA_*` and similar names cannot be set.
- **Agent variables.** `env:` in `agent.md`, edited on the Agents page. Resolved values reach the
  agent's commands on every engine:
  - Aura's Bash;
  - Claude Code's process environment;
  - ACP agents;
  - container `exec` via `--env NAME`, so values never appear in arguments.

  The agent is told the names, never the values. Unset names are listed for it to report.
- **Redaction.** Stored secret values are replaced with `[secret]` in final replies, run card
  summaries, last-error texts and MCP test logs. Streaming text is redacted when the reply
  completes.
- **Agent status.** For each agent, the Agents page and the orchestrator's read-only
  `inspect_setup` show:
  - engine readiness;
  - granted tools its engine does not provide (Aura's loop has no WebSearch);
  - notes for ACP and Ollama;
  - variables without values;
  - variable URLs whose host the command sandbox blocks;
  - chats, and the last error.

  `test_integration` lets the orchestrator test a server. Neither tool can change anything or see
  a secret value.
- **The orchestrator knows Aura.** Its profile file is written once, at first start, so it cannot
  carry new knowledge. Two things are added at run time instead:
  - a section describing chats, agents, engines and pages;
  - the user guide (`docs/wiki`, embedded in the server) through `aura_docs`.

  It can add an existing agent to a project (`add_agent_to_project`, no approval: the user asks
  for it, and the chat shows it) and propose changes to an agent's tools, variables, role or
  instructions (`propose_agent_change`, approved on a card with the diff of `agent.md`). Other
  agents are told they cannot change their own setup and must say what they miss.
- **More than one kind of service.** MCP servers at a URL take headers, with credentials only as
  references inside the value (`Authorization: Bearer ${secret:TOKEN}`). **Variable sets**
  (`integrations/variables.json`) give a service's address and token to several agents' commands
  for CLIs and scripts; an agent's own variables win on a clash.
- **A secret does nothing until it is given.** Every variable editor offers the stored secrets as
  one-click buttons. A server test that finds stored secret names in the server's log or error,
  not given to it, says so and offers to give them.
- **Network.** A host check from the server reports reachability with a plain reason, and whether
  the sandbox allows the host. Proxy variables of the server's environment are passed to commands,
  MCP servers and containers.

## Not yet

- Per-agent or per-integration network rules (the sandbox allowlist is global).
- VPN management; Aura uses whatever network the computer has.
- Starting and stopping long-running servers: MCP servers live for one run.
- New extension types beyond panels and MCP servers.

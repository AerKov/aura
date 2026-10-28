# 0022: Per-agent network rules

- Status: superseded by 0030 (no network for agents' commands)
- Date: 2026-10-27
- Phase: 19

## Context

The command sandbox (ADR 0015) had one list of allowed hosts for every agent. An agent that talks
to an internal tracker needed that host on the shared list, so every agent could reach it, and a
research agent could not be kept off the network at all. WebFetch had no host rules.

## Decision

- An agent's profile may carry `network`: its own `hosts` (host names or `*.domain`), whether it
  also gets the `shared` list (default yes), and `restrictWeb` (WebFetch only to those hosts,
  default no). Without the field nothing changes.
- The hosts its commands reach are the shared list (unless off) plus its own. With the shared list
  off and no hosts, its commands reach nothing.
- **Aura's own agent:** the sandbox runtime starts with no hosts allowed for everyone; each command
  registers its agent's list under a random 128-bit id (`registerCommandNetworkLists`) and drops it
  when the command exits. Agents with different rules can run at the same time.
- **Claude Code:** the list goes into the run's sandbox settings; WebFetch is checked in
  `canUseTool`.
- **ACP engines:** fetch requests are checked by URL when the agent's WebFetch is limited. Their
  shell commands run in their own process, so Aura cannot limit them; the agent's card says so.
- **Containers:** the project's container network setting applies; the card says so.
- The user edits the rules on the agent's card (one commit). The orchestrator proposes them with
  `propose_agent_change` (approval, with the diff of `agent.md`). The host check names the agents
  that may reach a host, and the card warns when a variable points to a host the agent cannot
  reach.

## Consequences

- The shared list can stay short (registries, code hosts); service hosts go to the agents that
  need them.
- A per-command list is attribution, not a wall between concurrent commands of one machine: a
  command that learned another command's id could use its list. Ids are random and live only while
  their command runs.

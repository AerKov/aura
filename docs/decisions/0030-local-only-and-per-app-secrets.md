# 0030: Local only: no containers or host lists; MCP on the Agents page; each app's own secrets

- Status: accepted
- Date: 2026-10-28
- Phase: 32
- Supersedes: 0018, 0019, 0022; partly 0020

## Context

Feedback on 0.31 (WISH-4, WISH-6): Aura is a core for personal tools on the user's own computer.
The Integrations page, Docker project containers, shared and per-agent host lists and the host
check were more machinery than that needs, and hard to understand. Apps should keep their keys to
themselves, protected the way agents' secrets are.

## Decision

- **No project containers.** Projects run their commands on the host, in the OS sandbox. The
  `isolation` field stays in the schema only so old rows remain valid.
- **No network for agents' commands.** The sandbox's allowed hosts are always empty; the shared
  list, per-agent rules (ADR 0022) and WebFetch limits are gone, and old `network` fields in
  `agent.md` are ignored. Agents use the web through their engine's own web tools.
- **No Integrations page or module.** MCP tool servers and agents' secrets are part of the Agents
  page (`/agents/setup`, `/agents/setup/mcp/:name`, `/agents/setup/secrets/:name`). Variable sets
  and the host check are removed; command tool servers can still share their variables with their
  agents. The orchestrator keeps `inspect_setup` and `test_mcp_server` (was `test_integration`).
- **Apps keep `net`.** An app reaches only the hosts the user approved for it, through Aura.
- **Each app has its own secrets** (`state/app-secrets.json`, 0600, outside git), set from the key
  button on its tile (`/extensions/:id/secrets`). The server puts them into that app's requests to
  its hosts only; no frame, other app or agent can read them. Shared secrets an app was granted
  before are copied into its own store once at start.

## Consequences

- Commands that download packages fail in the sandbox; the agent is told so and asks the user.
- Agents' secrets (`state/integration-secrets.json`, name kept) and apps' secrets are separate
  stores: the same name can hold different values.

# Security policy

Aura runs AI agents on your computer, so security reports are very welcome.

## Reporting

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/AerKov/aura/security/advisories/new), not in public
issues. Include steps to reproduce and the impact. You will get an answer within a week.

## What counts

Especially interesting:

- an agent escaping its workspace (files outside the project, or the app core);
- a tool call or side effect that skips approval;
- instructions in external content (web pages, alerts, files, extensions) that make an agent act;
- an extension escaping its sandbox or using permissions it was not granted;
- API keys or device tokens leaking (to the client, logs, agents, or another service);
- the server being reachable from the network when `AURA_REMOTE` is off, or pairing weaknesses.

## Design

The threat model and the safeguards are described in [docs/SPEC.md](docs/SPEC.md) (section 10) and
the ADRs, especially [0005](docs/decisions/0005-agents-and-projects.md),
[0008](docs/decisions/0008-customization.md), [0009](docs/decisions/0009-mobile-pairing.md),
[0011](docs/decisions/0011-agent-engines.md) and [0012](docs/decisions/0012-acp-agents.md).

Aura is a proof of concept. Shell commands of Claude Code and Aura's own agent run in an OS sandbox
when the machine supports it (ADR 0015); Gemini CLI, Codex, OpenCode and MCP servers are not wrapped
by Aura yet. Check the sandbox status on the Engines page.

# Security policy

Aura runs AI agents on your computer, so security reports are very welcome.

## Reporting

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/AerKov/aura/security/advisories/new), not in public
issues. Include steps to reproduce and the impact. You will get an answer within a week.

## What counts

Especially interesting:

- a helper escaping its workspace (files outside the app's folder, or Aura's code);
- a tool call or side effect that skips approval;
- instructions in external content (web pages, files, apps) that make a helper act;
- an app escaping its sandbox or using permissions it was not granted;
- API keys or app secrets leaking (to the client, logs, helpers, or another service);
- the server being reachable from the network.

## Design

The threat model and the safeguards are described in [docs/SPEC.md](docs/SPEC.md) (section 9) and
the ADRs, especially [0005](docs/decisions/0005-agents-and-projects.md),
[0008](docs/decisions/0008-customization.md), [0011](docs/decisions/0011-agent-engines.md),
[0030](docs/decisions/0030-local-only-and-per-app-secrets.md) and
[0042](docs/decisions/0042-build-your-own-apps-by-chat.md).

Aura is a proof of concept. Shell commands of Claude Code and Aura's own agent run in an OS sandbox
when the machine supports it (ADR 0015).

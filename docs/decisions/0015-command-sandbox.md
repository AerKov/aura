# 0015: OS sandbox for agents' shell commands

- Status: accepted
- Date: 2026-10-27
- Phase: 12

## Context

Sandbox level 0 (ADR 0005) checks every tool call in the app: granted tools only, file paths inside
the project. A granted `Bash` could still do anything the user can: read `~/.ssh`, write anywhere,
reach any host. That was the largest known gap.

## Decision

- **Level 1 is an OS sandbox, not a container.** No Docker is needed. It uses bubblewrap and socat
  on Linux, and Seatbelt on macOS.
  - Claude Code runs its Bash in its own sandbox: the SDK `sandbox` option, with
    `allowUnsandboxedCommands: false` so there is no escape hatch, and `autoAllowBashIfSandboxed:
    false` so every command still passes `canUseTool`.
  - Aura's own agent loop wraps its Bash with the same runtime, `@anthropic-ai/sandbox-runtime`
    (Anthropic, Apache-2.0), which Claude Code uses too.
  - Inside the sandbox a command can:
    - write only in the project folder and the temp folder;
    - not read credentials (`~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.kube`, `~/.docker`, `~/.npmrc`,
      `~/.netrc`, `~/.config/gh`, `~/.config/gcloud`, the agent apps' logins) or Aura's `state/`;
    - reach only allowed hosts through the runtime's proxy. By default these are package registries
      and code hosts (npm, PyPI, crates, Go, GitHub…).
- **Modes** live in `sandbox.json` in the data dir (committed):
  - `auto` (default): sandbox when the machine supports it, otherwise run as before. The Engines page
    says so and names what to install.
  - `required`: never run a command outside the sandbox. Commands fail instead.
  - `off`.
    The allowed hosts are edited on the same card.
- Agents with Bash are told about the sandbox in their system prompt, so they report a blocked
  command instead of fighting it.
- The compiled sidecar embeds the Linux `apply-seccomp` helper, which stops sandboxed commands
  from creating namespaces. It is written once to the temp folder at run time.
- **Fix found while testing.** With the sandbox on, Claude Code reports `blockedPath` also for paths
  inside the working directory. The permission check now denies only paths outside it, comparing
  real paths (`/tmp` is `/private/tmp` on macOS).

## Not covered yet

- Gemini CLI, Codex and OpenCode run their own tools. Aura decides their permission requests
  (ADR 0012), and they have sandboxes of their own, but Aura does not wrap them.
- Windows: the runtime needs an installed sandbox account, so `auto` falls back there.
- MCP servers started for agents are not sandboxed.

Verified live in Linux with bubblewrap: Claude Code and Aura's Bash wrote in the project, failed to
write in the home folder, and could not reach example.com while the npm registry worked.

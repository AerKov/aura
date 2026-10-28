# 0019: MCP servers in project containers; agent apps stay on the host

- Status: superseded by 0030 (project containers removed)
- Date: 2026-10-27
- Phase: 16

## Context

ADR 0018 moved agents' shell commands into a container per project. MCP servers started for those
agents (tier 2 customization) still ran on the host with the user's permissions. Gemini CLI,
Codex and OpenCode (ADR 0012) also run on the host.

## Decision

- **Stdio MCP servers of a container project run inside its container.** Before a run, the
  runtime passes the agent's servers through `projectMcp`. Each stdio server becomes
  `docker exec -i -w /workspace --env NAME… <container> <command> <args>`, which every engine can
  spawn: the Claude Agent SDK, Aura's own loop, and ACP agents.
- **Secrets stay out of argument lists.** Values resolved from `${env:NAME}` references are given
  to the CLI process as environment and forwarded with `--env NAME` (no value), so they never
  appear in the host's process list. The CLI also gets only `PATH`, `HOME` and the Docker
  connection variables from the server's environment.
- **Fail closed.** If the container cannot start, stdio servers are left out of the run, with a
  warning in the log; they are never started on the host instead. HTTP servers are unchanged in
  every case.
- The image needs the server's runtime (`npx`, `uvx`…); the default `node:22-bookworm` has Node.js.
- **Agent apps stay on the host.** Gemini CLI, Codex and OpenCode need their own logins. Running
  them in a container would mean mounting or copying those credentials into it, which CLAUDE.md
  rule 4 forbids. Their tools are still decided by Aura (ADR 0012), and in a container project they
  get no host shell: `Bash` is not granted, and the container `Bash` tool is offered instead.

## Not yet

- MCP servers of the direct chat (no project) still run on the host.
- A long run that uses only MCP tools does not keep the container from its idle stop.

Verified with Docker 29: a stdio MCP server (Node.js) answered from Debian in `/workspace`, with
its secret, and could not see the host's data folder.

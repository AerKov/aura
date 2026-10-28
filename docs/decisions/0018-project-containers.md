# 0018: A container per project (sandbox level 2)

- Status: superseded by 0030 (project containers removed)
- Date: 2026-10-27
- Phase: 15

## Context

The OS sandbox (ADR 0015) limits writes and network, but commands still run on the user's own
system: they see its files (except the denied paths), its tools and its processes. It is not
available on Windows. Some projects need a stronger boundary.

## Decision

- **Per project, chosen by the user.** Projects get `isolation`: `host` (as before) or
  `container`. It is changed only from the app (`PUT /projects/:id/isolation`), never by an agent.
  New projects take the default from `sandbox.json` (`container.newProjects`, off by default).
- **One long-lived container per project**, via the Docker or Podman CLI (`AURA_CONTAINER_CLI`
  forces one). It is created on the first command and named `aura-<data dir hash>-<project>`.
  - Only the project folder is mounted, at `/workspace`.
  - Commands run as the user's uid:gid, so files keep their owner.
  - `--cap-drop ALL`, `no-new-privileges`, `--init`.
  - Limits on memory (4 GB), CPUs (2) and processes (1024).
  - Network on or off (`--network none`).
  - Image `node:22-bookworm` by default.

  A label holds a hash of the settings; when they change, the container is recreated on its next
  command. Containers stop after 30 minutes without commands. "Reset container" removes one.
- **The shell is replaced, not added.** For agents granted `Bash` in a container project, the
  runtime removes the built-in `Bash` and gives an app tool named `Bash` that runs the command in
  the container. App tools reach every engine:
  - Claude Code over in-process MCP;
  - Aura's own loop directly;
  - ACP agents over the tool bridge.

  ACP agents' own shells are denied because `Bash` is no longer granted. File tools keep working on
  the same folder from the host, confined as before.
- **Commands** are passed as arguments, never pasted into a shell string, and run under the
  image's bash (sh when bash is missing). Timeouts and stops are enforced inside the container:
  `timeout`, plus a marker that finds and kills the command's process group on abort.
- **Fail closed.** If the container runtime is missing or the container cannot start, the command
  fails with the reason. It never falls back to the host.
- No new dependency: the existing CLI is spawned with a minimal environment.

## Not yet

- Gemini CLI, Codex, OpenCode and MCP servers themselves still run on the host.
- No allowlist of hosts inside containers (network is all or nothing).
- No per-project image or Dockerfile; the image is one setting for all projects.
- SELinux hosts with Podman may need a `:Z` volume label.

Verified live with Docker 29: Claude Code (Haiku) in a container project wrote and ran `hello.js`
under Debian 12 on an Ubuntu host. The file appeared in the project folder, and `~/.ssh` and the
Claude login were not visible.

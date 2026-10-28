# Aura 0.21 alpha

Aura is a messenger where you work with an AI orchestrator and a team of AI agents. This is the
first public build. It works end to end, but expect rough edges. Please
[report what breaks](https://github.com/AerKov/aura/issues/new/choose).

## Install

Download the installer for your system from the release:

| System                | File                          |
| --------------------- | ----------------------------- |
| macOS (Apple Silicon) | `.dmg`                        |
| Windows 10/11 (x64)   | `.msi` or `-setup.exe`        |
| Linux (x64)           | `.AppImage`, `.deb` or `.rpm` |

The builds are **not signed** yet:

- macOS: right-click Aura → **Open** the first time.
- Windows: on the SmartScreen warning choose **More info** → **Run anyway**.

## You need one engine

Agents need a model. Aura uses what you already have and never asks for or stores your logins:

- **Claude Code**, logged in with your Claude subscription (run `claude` once in a terminal);
- or **Gemini CLI**, **Codex** or **OpenCode**, logged in with their own commands;
- or **Ollama** / **LM Studio** on your computer, free;
- or an **OpenRouter** key, with free models available.

Then follow [Getting started](https://github.com/AerKov/aura/wiki/Getting-Started).

## Connecting your tools

Trackers, databases and internal APIs connect on the **Integrations** page: an MCP server or a
script, its keys stored as secrets (no `~/.profile` needed), and a **Test** button that says what
is wrong. The **Agents** page shows what each agent can do and what stops it. Or just ask the
orchestrator: it knows how Aura works and can check the setup for you. Details:
[Integrations](https://github.com/AerKov/aura/wiki/Integrations).

## Optional

- **Command sandbox:** macOS works out of the box. On Linux install `bubblewrap` and `socat`.
- **Project containers:** Docker Desktop or Podman, for projects that run in their own container.
- **Phone:** start with `AURA_REMOTE=1` and pair from the Devices page.

## Your data

Everything stays on your computer, in `~/.aura`: agents, skills and settings as files in a git
repository, chats and history in a local database. Uninstalling the app keeps this folder.

## Known limits

- One user per installation (no accounts or sharing yet).
- Packs from links are not signed. Read the preview before installing one.
- Intel Macs: no build yet; run from source.
- Windows has no command sandbox. Use project containers (Docker Desktop) for isolation.
- No automatic updates yet: download new versions from Releases.
- Gemini CLI, Codex and OpenCode run on your computer even in container projects; Aura still
  decides what they may do.
- Data from this alpha should carry over, but back up `~/.aura` before updating.

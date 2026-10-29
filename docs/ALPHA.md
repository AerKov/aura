# Aura alpha

Aura holds your own small apps next to a team of AI helpers who make and change them for you. It
works end to end, but expect rough edges. Please
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

## Your apps

**My apps** (the **A** at the top of the bar) lists your apps by group, and the built-in ones
(Chats, Alerts, Reminders, Helpers…); advanced mode shows more and lets you turn them off.
Describe a tool you need and @builder makes it as an app with its own chat; every change waits for your approval. **Restore points** take the whole Aura
back, or forward again, and **Language** switches Aura to Ukrainian. Details:
[The screen](https://github.com/AerKov/aura/wiki/The-Screen), [Apps](https://github.com/AerKov/aura/wiki/Apps).

## Connecting your tools

Trackers, databases and internal APIs connect on the **Helpers** page: an MCP server (a command or
a URL), its keys stored as secrets, and a **Test** button that says what is wrong. Each agent's card
shows its full prompt, what it can do and what stops it. Or just ask the orchestrator: it knows how
Aura works and can check the setup for you. Details:
[Agents](https://github.com/AerKov/aura/wiki/Agents).

## Optional

- **Command sandbox:** macOS works out of the box. On Linux install `bubblewrap` and `socat`.
  Agents' commands have no network; they use the web through their engine's web tools.
- **Phone:** start with `AURA_REMOTE=1` and pair from the Phone app.

## Your data

Everything stays on your computer, in `~/.aura`: agents, skills and settings as files in a git
repository, chats and history in a local database. Uninstalling the app keeps this folder.

## Known limits

- One user per installation (no accounts or sharing yet).
- Packs from links are not signed. Read the preview before installing one.
- Intel Macs: no build yet; run from source.
- Windows has no command sandbox yet: agents' commands run with your user's permissions there.
- No automatic updates yet: download new versions from Releases.
- Gemini CLI, Codex and OpenCode use their own sandboxes; Aura still decides what they may do.
- Data from this alpha should carry over; save a restore point (or copy `~/.aura`) before updating.

# Aura alpha

Aura lets you build your own small apps by chatting with a helper, on your own computer. It works
end to end, but expect rough edges. Please
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

## You need an AI

The easiest way is the **built-in local AI** (Settings → AI): Aura installs llama.cpp and a model
that fits your computer when you ask, free and private. **Ollama**, **LM Studio** and **Claude
Code** (under its own login, which Aura never reads) work too.

Then follow [Getting started](https://github.com/AerKov/aura/wiki/Getting-Started).

## Your apps

Tell the **Helper** what you need, or press **New app** in the sidebar. Each app opens with its chat
beside it, where @builder changes it; every change waits for your approval, and every version can
be brought back. Uninstalled apps wait in Settings → History. Details:
[The screen](https://github.com/AerKov/aura/wiki/The-Screen), [Apps](https://github.com/AerKov/aura/wiki/Apps).

## Optional

- **Command sandbox:** macOS works out of the box. On Linux install `bubblewrap` and `socat`.
  Helpers' commands have no network.

## Your data

Everything stays on your computer, in `~/.aura`: helpers, themes and apps as files in git, chats and
history in a local database. Uninstalling Aura keeps this folder.

## Known limits

- One user per installation (no accounts or sharing yet).
- Intel Macs: no build yet; run from source.
- Windows has no command sandbox yet: helpers' commands run with your user's permissions there.
- No automatic updates yet: download new versions from Releases.
- No phone client in this version.
- Data from earlier alphas is not converted: start with a fresh `~/.aura`.

# 0016: Catalog of packs

- Status: accepted
- Date: 2026-10-27
- Phase: 13

## Context

A new user starts with only the orchestrator. Writing good agent prompts, skills and themes by hand
takes time. People also want to share a team that works for them. Installing someone else's files
is risky, though: an agent profile can grant a shell, a skill changes prompts, and an extension
runs code in the UI.

## Decision

- **A pack** is a `pack.json` plus files. The manifest has `id`, `name`, `version`, `description`,
  `author`, `tags` and `files`. A pack may only contain user customization:
  - `agents/<handle>/agent.md`
  - `skills/<name>/SKILL.md`
  - `themes/<name>/theme.css`
  - `snippets/<name>.css`
  - `extensions/<id>/manifest.json`, `main.js` and `styles.css`

  Every file is validated with the same parsers the app uses. There are limits: 60 files,
  200 KB per file and 1 MB in total. MCP servers are not in packs, because they run programs on the
  user's machine.
- **Sources:**
  - Built-in packs ship in the server binary: dev team, writing team, research, on-call, themes and
    an alerts panel.
  - URL packs come from a GitHub repository or folder (read through `raw.githubusercontent.com`), or
    from an https URL ending in `pack.json`. Private and local hosts and URLs with credentials are
    refused.
- **Preview before anything is written.** The preview lists every file as new, replaced or
  unchanged, with a diff for each replaced file. It names what to watch for:
  - agents that get a shell;
  - extensions that can post;
  - overwrites;
  - URL sources.

  The preview carries a sha256 of the pack. Installing requires that hash, so what gets installed
  is exactly what was shown. A URL that changed in between is refused.
- **Two ways to install:**
  - the Catalog screen, which is a user action after the preview;
  - the orchestrator's `install_pack` tool, which creates a `pack_install` approval (ADR 0004).
    The approval stores the content itself and checks it again before writing.
- **Installing** writes the files, records `catalog.json` (version, hash, source and files per
  pack), and makes one git commit, `pack(<id>): install <version>`, so it can be reverted. Extensions
  in the pack are enabled with the permissions shown in the preview.

## Not yet

- Signatures and a reviewed community index.
- Uninstall: for now, revert the commit, or delete the files.
- Update notices when a URL pack changes.

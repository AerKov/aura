# 0040: Fewer settings, one mode

- Status: accepted
- Date: 2026-10-30
- Phase: 38 (follows ADR 0039)

## Context

After Settings became one app (ADR 0039) the user went through every tab and found parts nobody
needs yet, and the same things in several places: free cloud services next to the local AI, tool
servers and secrets on the Helpers page, inside each helper and on the Look page, packs and the
"Dev team" next to backups, an Advanced tab, and an advanced mode that hid features.

## Decision

- **No free cloud services.** Google Gemini, Groq, OpenRouter, Cerebras and Mistral are gone as
  engines (ADR 0037 is replaced). The AI tab has two groups: on this computer (the built-in
  llama.cpp, Ollama, any OpenAI-compatible server) and your own agent app (Claude Code, Codex,
  Gemini CLI, OpenCode). The first-run panel points to the local AI. A profile or `engines.json`
  that still names a removed engine falls back to the default.
- **Tools and keys in one place:** Settings → Helpers → Tools and keys holds the tool servers (MCP)
  and the secrets. A helper's card shows which servers it has; an app keeps its own secrets on its
  tile. The Look page no longer lists tool servers.
- **History instead of Data:** restore points and uninstalled apps only. The packs screen and the
  templates in "New app" are gone from the interface (the server's catalog stays for later).
- **No Advanced tab, no switches.** Built-in parts are always on: the module registry, its routes
  and `modules.json` are removed (ADR 0027's switches are replaced). The command sandbox keeps its
  defaults without a settings screen.
- **No advanced mode.** What it showed is shown to everyone: tokens and commits on run cards, an
  alert's technical details, the Alerts web address, chat summaries, app data and discarding a
  draft. Helpers go by their names; the handle is on their card.

## Consequences

- CLAUDE.md rule 2 says everything built in is always on.
- Settings tabs: AI, Helpers, Automations, Look, History. Old page ids still open the right tab.

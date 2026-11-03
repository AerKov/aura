# 0043: Codex under the user's ChatGPT plan

- Status: accepted
- Date: 2026-11-03
- Phase: 39b (amends ADR 0042; brings back part of ADR 0012)

## Context

ADR 0042 kept two kinds of AI: Aura's own loop over local or OpenAI-compatible models, and Claude
Code under the user's own Claude login. A user with a ChatGPT Pro plan could not use it: an OpenAI
API key is billed apart from the plan, and the only way to work under the plan itself is OpenAI's
own agent, Codex, signed in with ChatGPT.

## Decision

- **Codex is an engine again**, next to Claude Code: "Codex (ChatGPT)". It runs Zed's
  `codex-acp` adapter over the Agent Client Protocol, as before ADR 0042, under the user's own
  `codex login`. Gemini CLI and OpenCode stay out.
- **The login stays with Codex.** Aura starts the CLI with the user's environment (without Aura's
  own settings) and never reads, stores or forwards the login (CLAUDE.md rule 4).
- **Aura still decides.** Every permission request of Codex is answered by the helper's granted
  tools and the app's folder; switching Codex into an auto-approve mode is always refused. File
  reads and writes go through Aura, confined to the folder.
- **The app's tools reach Codex over MCP** (the tool bridge of ADR 0012): one unguessable URL per
  run, on loopback only, that dies with the run. External tool servers stay out (ADR 0042).
- In Settings → AI the group is **"Your subscription"**: Claude Code and Codex. Codex has no model
  list; it uses the plan's default unless a model is typed in.

## Consequences

- `@agentclientprotocol/sdk` is a dependency again; the ACP provider, its tests and the MCP route
  `/mcp/runs/:token` are back.
- The user installs Codex themselves (`npm i -g @openai/codex @zed-industries/codex-acp`) and signs
  in once (`codex login` → ChatGPT). Aura's card says so when it is missing or signed out.

# 0004: Claude Agent SDK provider and the user's own Claude Code

- Status: accepted
- Date: 2026-10-27
- Phase: 2

## Decision

- The first `LLMProvider` (`apps/server/src/providers/claude-agent-sdk.ts`) uses
  `@anthropic-ai/claude-agent-sdk`. It spawns Claude Code, which uses its own login. The app never reads,
  stores or forwards credentials.
- **The executable is the user's own Claude Code installation** (`locateClaude()`:
  `CREW_CLAUDE_EXECUTABLE`, `PATH`, then the usual install locations). The SDK ships its own
  binary (~290 MB per platform); bundling it would blow up the installer, so it is used only as a
  fallback in dev. In the compiled sidecar, if no `claude` is found, the provider reports
  "not installed" and the UI shows the setup panel.
- Agents run in isolation from the user's Claude Code config: `settingSources: []` (no user/project
  settings, hooks or CLAUDE.md), `persistSession: false`, `permissionMode: "dontAsk"` with an explicit
  `tools`/`allowedTools` list, so anything not granted is denied instead of prompting.
- Availability check: starting a query with an idle streaming prompt and reading `accountInfo()` proves
  Claude Code runs, at no token cost. Login problems are detected from the SDK's assistant error codes
  (`authentication_failed`, `billing_error`, ...) and remembered until "Check again".
- Context per run: the agent profile's system prompt plus the last 30 chat messages and the trigger,
  rebuilt every run (no SDK session resume). Text streams to clients as `message.delta`; the final
  message is persisted once.
- Usage and cost come from the SDK's result message (`usage`, `total_cost_usd`) and are stored per run.
- Default model `claude-opus-5-5` (`CREW_DEFAULT_MODEL` overrides; agent profiles can set their own).

## Notes

- The sidecar is built without identifier minification: Elysia inspects handler source to decide which
  context fields to pass, and renamed parameters broke the auth macro.

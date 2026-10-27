# 0012: Other agent apps over the Agent Client Protocol

- Status: accepted
- Date: 2026-10-27
- Phase: 9

## Context

Users want to pick popular agent systems, not only Claude Code: Gemini CLI (free tier with a Google
login), Codex (ChatGPT plan), OpenCode (open source, any provider). Each has its own CLI, login and
output format. The Agent Client Protocol (ACP, agentclientprotocol.com, made by Zed) is the common
way editors drive these agents: JSON-RPC over stdio.

## Decision

- Aura is an **ACP client** (`providers/acp.ts`, `@agentclientprotocol/sdk`, protocol v1). One
  adapter supports every ACP agent. The current list:
  - `gemini-cli`: `gemini --acp`. The model is passed with `--model`.
  - `codex`: `codex-acp`, Zed's adapter for Codex.
  - `opencode`: `opencode acp`.
- Executables are found like Claude Code's: `AURA_<NAME>_EXECUTABLE`, then `PATH`, then the usual
  global install folders.
- **Logins stay with the agents.**
  - The CLI runs with the user's environment (minus `AURA_*`) and reads its own credentials.
  - Aura never reads, stores or forwards them, the same as rule 4 for Claude.
  - An auth error (JSON-RPC -32000) becomes a "log in with `<cli>`" hint.
- **Aura stays in control** (sandbox level 0):
  - Every `session/request_permission` is decided by the agent's grants, mapped by ACP tool kind:
    - read/search → Read/Grep/Glob.
    - edit/delete/move → Write/Edit.
    - execute → Bash.
    - fetch → WebFetch.
    - Locations must be inside the workspace.
    - `switch_mode` is always rejected, so an agent cannot turn on its own auto-approval.
    - Only `allow_once` / `reject_once` are chosen, never "always".
  - Aura offers the `fs` client capability, so file reads and writes go through Aura. They are
    resolved inside the workspace, and writes need Write or Edit.
  - Aura does not offer terminals. Agents run commands themselves after asking permission (execute).
- **App tools over MCP.**
  - Each run gets an MCP endpoint `/mcp/runs/<token>` served by the Aura server
    (`modules/engines/tool-bridge.ts`, `@modelcontextprotocol/sdk`, stateless Streamable HTTP with
    JSON responses).
  - The token is 24 random bytes. The endpoint exists only while the run runs, accepts loopback
    connections only, and exposes only that run's tools.
  - The agent receives it in `session/new` as an `http` MCP server named `aura` (when it supports
    MCP over HTTP), plus the MCP servers from `mcp/servers.json` granted to that agent.
- **Prompt.** ACP has no stable system prompt field yet, so the agent's instructions go first in the
  prompt, inside `<instructions>`.
- **Usage.** Tokens come from `PromptResponse.usage` and cost from `usage_update` when the agent
  reports them. Budgets can stop an ACP run only when cost is reported (it is cancelled). Plans like
  a Google or ChatGPT subscription have no per-run cost.

## Consequences

- Adding another ACP agent is one entry in `ACP_AGENTS` (registry.ts).
- Confinement depends on the agent asking permission for its own tools. Gemini CLI and Codex do in
  their default modes; their own sandboxes add to it. Containers (level 1) remain the real boundary.
- Not tested here against the real CLIs, which need their logins. Tests use a fake agent built on
  the official SDK's agent side and the official MCP client.

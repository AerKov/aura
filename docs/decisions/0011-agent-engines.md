# 0011: Agent engines and Aura's own agent loop

- Status: accepted
- Date: 2026-10-27
- Phase: 9

## Context

Claude Code is the strongest coding agent, but it needs a Claude subscription or API account. The
user wants a choice of engines, including free ones, and an own agent system that works through
OpenRouter or Ollama.

## Decision

- **An engine is an `LLMProvider`** (rule 5 still holds). The ids are listed in
  `packages/shared/src/engines.ts`:
  - `claude-code`: the Claude Agent SDK (ADR 0004).
  - `openrouter`: a cloud router with one API key. Free models (`:free`) are rate limited.
  - `ollama`: local models, free and private.
  - `openai-compatible`: any OpenAI-compatible server: LM Studio, llama.cpp, vLLM, or a cloud API.
- **Aura's own agent loop** (`providers/openai-compat.ts`) runs the last three engines:
  - It streams chat completions with tool calling.
  - It runs the tools in-process, feeds the results back, and repeats until the model answers
    without a tool call.
  - It stops at `maxTurns`, at the run budget (when the service reports `usage.cost`), or on abort.
  - Tool arguments are validated with the tool's zod schema before any handler runs.
- **Built-in tools** for the loop (`providers/native-tools.ts`) use Claude Code's names, so agent
  profiles work on every engine: Read, Write, Edit, Glob, Grep, Bash, WebFetch. WebSearch is not
  available yet.
  - File tools resolve paths inside the workspace and follow symlinks of the nearest existing
    ancestor, so a link cannot escape.
  - Bash runs `bash -c` in the workspace with a minimal environment (PATH, HOME, LANG…), never the
    server's own environment. Like Claude Code's Bash at sandbox level 0, it is not a jail;
    containers are level 1.
  - WebFetch reaches only public hosts (no loopback, LAN or link-local addresses). Its output is
    wrapped in `<external_data>` (rule 7).
- **App tools** (create_project, tasks…) are the same `AgentTool`s for both loops.
  - Claude Code gets them over the SDK's in-process MCP server.
  - The own loop calls them directly.
  - External MCP servers (`mcp/servers.json`) granted to an agent are connected with the official
    MCP client (`providers/mcp-client.ts`). Their tools are named `mcp__<server>__<tool>`, as in
    Claude Code. A server that does not start is skipped with a warning.
- **Selection.**
  - `engines.json` in the data dir (config in files, committed) holds the default engine, a
    default model per engine, and the Ollama and custom server URLs.
  - An agent profile may name `engine:` and `model:` in its frontmatter.
  - A profile without an engine uses the default engine. Its `model` then applies only when that
    engine is Claude Code, because older profiles carry Claude model ids.
  - The orchestrator can set `engine` when it proposes an agent; this still goes through approval.
- **API keys** are the user's own keys for those services, not Claude credentials (rule 4 is
  untouched).
  - They are stored in `state/secrets.json` with mode 0600. `state/` is outside git.
  - Keys are written from the Engines page and never returned by the API, logged, given to agents,
    or passed to their shell.
  - A key is sent only to its own service.
- **Costs.**
  - OpenRouter reports cost per request.
  - Ollama is free (cost 0).
  - Custom servers are unknown unless they report a cost; budgets then cannot stop a run by spend,
    only by turns.

## Later

- Gemini CLI, Codex and OpenCode: done in ADR 0012 (ACP).
- WebSearch through a search API.

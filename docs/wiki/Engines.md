# Engines

An **engine** is what actually runs an agent. Aura supports two families, and each agent can use a
different one.

**Agent apps** are complete coding agents that you install and log in to yourself. Aura starts them,
streams their work into the chat and decides what they may touch. Your login stays with the app;
Aura never reads it.

**Aura's own agent** is a built-in agent loop that works with any model behind an OpenAI-compatible
API: a cloud router, or a model on your own machine.

| Engine            | Kind                  | Login or key                   | Cost                                    |
| ----------------- | --------------------- | ------------------------------ | --------------------------------------- |
| Claude Code       | agent app (Agent SDK) | your Claude login              | Claude plan or API                      |
| Gemini CLI        | agent app (ACP)       | your Google login              | generous free tier                      |
| Codex             | agent app (ACP)       | ChatGPT plan or OpenAI API key | plan or API                             |
| OpenCode          | agent app (ACP)       | its own providers              | depends on provider                     |
| OpenRouter        | Aura's agent          | API key pasted in Aura         | free models available                   |
| Ollama            | Aura's agent          | none                           | free, local                             |
| OpenAI-compatible | Aura's agent          | optional key                   | LM Studio, llama.cpp, vLLM: free, local |

## Choosing

- **Best results:** Claude Code. It is the strongest coder and the most tested with Aura.
- **Free, in the cloud:** Gemini CLI with a Google account, or free models on OpenRouter.
- **Free and private:** Ollama or LM Studio with a model that supports tool calling (qwen3 is a good
  start). Small models follow tools less reliably; give them simpler jobs.
- **Mix:** a strong engine for the coder, a free one for the reviewer or a news digest agent.

## Setting up each engine

### Claude Code

Install it (`npm install -g @anthropic-ai/claude-code`), run `claude` in a terminal and log in.
Aura finds it automatically; set `AURA_CLAUDE_EXECUTABLE` if it is somewhere unusual.

### Gemini CLI

`npm install -g @google/gemini-cli`, run `gemini` once and sign in with Google. Optional default
model: `gemini-2.5-pro`, `gemini-2.5-flash`, or a preview model.

### Codex

`npm install -g @openai/codex @zed-industries/codex-acp`, then `codex login`. Aura talks to Codex
through Zed's `codex-acp` adapter.

### OpenCode

`npm install -g opencode-ai`, then `opencode auth login` to connect a provider.

### OpenRouter

Create a key at openrouter.ai/keys and paste it into the OpenRouter card. The model list shows only
models that support tools, free ones first (tick **Show free models only**). Free models are rate
limited by OpenRouter.

### Ollama

Install from [ollama.com](https://ollama.com), pull a model with tool calling (`ollama pull qwen3:8b`)
and start Ollama with a longer context: `OLLAMA_CONTEXT_LENGTH=32768 ollama serve`. The default 4K
context is too small for agents. Change the server URL in the card if Ollama runs elsewhere.

### OpenAI-compatible (LM Studio and others)

Start the server (LM Studio: _Developer → Start server_), put its URL in the card (LM Studio's default
is `http://127.0.0.1:1234/v1`), add a key if the server needs one, and pick a model.

## Default engine and per-agent engines

- **Use for all agents** makes an engine the default for every agent without its own choice.
- **Per agent** (bottom of the Helper programs page) picks an engine and model for one agent. This is saved in
  the agent's file (`agents/<handle>/agent.md`, fields `engine:` and `model:`).
- The orchestrator can also suggest an engine when it proposes a new agent; you see it on the
  approval card.

## What each engine can do

All engines get the same things from Aura: the agent's instructions and skills, the chat context, the
app's tools (projects, tasks, skills, schedules…) and the MCP servers you granted to that agent.

- **Agent apps** use their own tools (files, shell, web). They must ask before acting, and Aura
  answers according to the tools the agent was granted and keeps files inside the project folder.
  Requests to switch the agent into an auto-approve mode are always refused.
- **Aura's agent** has built-in tools named like Claude Code's: Read, Write, Edit, Glob, Grep, Bash
  and WebFetch (no web search yet). File tools cannot leave the project folder; shell commands run
  without Aura's environment; WebFetch cannot reach your machine or local network.

## Budgets

Every engine reports tokens, so a limit in tokens works everywhere. Dollar amounts come from the
engine: real for OpenRouter, an estimate at API prices for Claude Code under a subscription, none
for local models and most subscription apps. See [Chats and agents](Chats-and-Agents#budgets).

## Keys and privacy

API keys you paste are stored in `~/.aura/state/secrets.json`, readable only by you, outside the git
history. They are never shown again, never logged, never given to agents, and sent only to their own
service. Agent apps keep their own logins; Aura only starts them.

For how this works inside, see ADR [0011](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0011-agent-engines.md)
and [0012](https://github.com/AerKov/aura/blob/HEAD/docs/decisions/0012-acp-agents.md).

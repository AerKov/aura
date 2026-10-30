# Engines

An **engine** is what actually runs a helper. Each helper can use a different one. They come in
three kinds, easiest first:

**Free services (start here).** Google Gemini, Groq, OpenRouter, Cerebras and Mistral give access to
models through an API. You make a key on the service's site (a minute, usually no card), paste it
into Aura, and Aura's own agent loop runs on it. Aura picks a model for you and makes the service the
default if nothing else works yet. Free plans have limits, and some use your prompts to improve their
models: the card says what applies.

**Local models.** Free and private, but they need a capable machine and a model that supports tools.
**Built-in local AI** installs llama.cpp for you: open **Helper programs**, pick a model that fits your
memory (or type any Hugging Face GGUF as `owner/name:Q4_K_M`), read the card that says what will be
downloaded and from where, and press **Yes, download**. Checksums are verified; the model runs only on
this computer, only while a helper uses it. Ollama, LM Studio, vLLM and other servers work too.

**Agent apps (advanced).** Complete coding agents that you install and log in to yourself: Claude
Code, Codex, Gemini CLI, OpenCode. Aura starts them, streams their work into the chat and decides what
they may touch. Your login stays with the app; Aura never reads it.

| Engine            | Kind                  | Login or key                   | Cost                             |
| ----------------- | --------------------- | ------------------------------ | -------------------------------- |
| Google Gemini     | free service          | key from aistudio.google.com   | free plan                        |
| Groq              | free service          | key from console.groq.com      | free plan                        |
| OpenRouter        | free service          | key from openrouter.ai         | free models (`:free`) available  |
| Cerebras          | free service          | key from cloud.cerebras.ai     | free plan, terms change          |
| Mistral           | free service          | key from console.mistral.ai    | free Experiment plan             |
| Ollama            | local                 | none                           | free                             |
| OpenAI-compatible | local or any API      | optional key                   | LM Studio, llama.cpp, vLLM: free |
| Claude Code       | agent app (Agent SDK) | your Claude login              | Claude plan or API               |
| Codex             | agent app (ACP)       | ChatGPT plan or OpenAI API key | plan or API                      |
| Gemini CLI        | agent app (ACP)       | your Google login              | generous free tier               |
| OpenCode          | agent app (ACP)       | its own providers              | depends on provider              |

## Choosing

- **Just starting:** a free service. Google Gemini is a good first pick; if you hit its limit, add Groq
  or OpenRouter and give a helper to each.
- **Best results:** Claude Code. It is the strongest coder and the most tested with Aura.
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

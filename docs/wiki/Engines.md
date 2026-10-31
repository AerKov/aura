# The AI

An **engine** is what runs a helper. Connect them in **Settings → AI**; at the top of that tab,
choose which one **the Helper** uses and which one **builds your apps** (@builder).

| Engine            | Kind                  | Login or key      | Cost                    |
| ----------------- | --------------------- | ----------------- | ----------------------- |
| Built-in local AI | on this computer      | none              | free, installed by Aura |
| Ollama            | on this computer      | none              | free                    |
| OpenAI-compatible | local or any API      | optional key      | LM Studio, vLLM: free   |
| Claude Code       | agent app (Agent SDK) | your Claude login | Claude plan or API      |

## Choosing

- **Just starting:** the built-in local AI with the recommended model.
- **Best apps:** Claude Code for @builder. It is the strongest coder and the most tested with Aura.
- **Free and private:** a local model with tool calling (qwen3 is a good start). Small models
  follow tools less reliably; describe changes in small steps.

## Setting up

### Built-in local AI

Pick a model that fits your memory (or type any Hugging Face GGUF as `owner/name:Q4_K_M`), read the
card that says what will be downloaded and from where, and press **Yes, download**. Checksums are
verified; the model runs only on this computer, only while a helper uses it. **Start** loads it now
(the card shows why if it cannot), **Stop** frees the memory. If Aura cannot tell which llama.cpp
build fits your system, choose the release and the build from the lists on the card.

### Ollama

Install from [ollama.com](https://ollama.com), pull a model with tool calling (`ollama pull qwen3:8b`)
and start Ollama with a longer context: `OLLAMA_CONTEXT_LENGTH=32768 ollama serve`.

### OpenAI-compatible (LM Studio and others)

Start the server (LM Studio: _Developer → Start server_), put its URL in the card (LM Studio's
default is `http://127.0.0.1:1234/v1`), add a key if the server needs one, and pick a model.

### Claude Code

Install it (`npm install -g @anthropic-ai/claude-code`), run `claude` in a terminal and log in.
Aura finds it automatically; set `AURA_CLAUDE_EXECUTABLE` if it is somewhere unusual. Your login
stays with Claude Code; Aura never reads it.

## What each engine can do

Every engine gets the helper's instructions, the chat and the app's tools. Claude Code uses its own
tools and asks before acting; Aura answers according to the tools the helper was granted and keeps
files inside the app's folder. Aura's own agent has Read, Write, Edit, Glob, Grep, Bash and
WebFetch; file tools cannot leave the folder, and WebFetch cannot reach your machine or network.

## Budgets

Every engine reports tokens, so a limit in tokens works everywhere. Dollar amounts are real only
for paid APIs.

## Keys and privacy

Keys you paste are stored in `~/.aura/state/secrets.json`, readable only by you, outside git. They
are never shown again, never logged, never given to helpers, and sent only to their own service.

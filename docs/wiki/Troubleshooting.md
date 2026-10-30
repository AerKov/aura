# Troubleshooting

**An agent does not answer.** Open the **Agents** page and pick it: the card lists what stops it
(engine not ready, a tool its engine lacks, a variable without a value, a host the sandbox blocks,
no chat, the last error). Agents answer only in chats they belong to; Aura says so when you mention
one elsewhere. You can also ask the orchestrator "why doesn't @name answer?".

**A tool server (MCP) does not work.** Agents → Tool servers → **Test** shows why and the server's
log. Servers set up in Claude Code are not used by Aura; add them on the Helpers page.

**A script needs keys or settings.** Set them as variables on the agent's card (keys as secrets),
not in `~/.profile`. See [Agents](Agents).

**"Error: claude native binary not installed".** Claude Code itself was installed without its
platform part. Reinstall it: `curl -fsSL https://claude.ai/install.sh | bash` (or
`npm install -g @anthropic-ai/claude-code` without `--ignore-scripts`), then run `claude` once.

**"Connect Claude Code" panel in the chat.** Claude Code is missing or not logged in. Install it, run
`claude` in a terminal and log in, then press **Check again**. Or pick another engine with **Use
another engine**.

**An engine says "not installed" although it is.** Apps started from the Dock or Start menu get a
short `PATH`. Set the path explicitly, for example `AURA_GEMINI_EXECUTABLE=/path/to/gemini` (the
pattern is `AURA_<NAME>_EXECUTABLE`; `AURA_CLAUDE_EXECUTABLE` for Claude Code).

**"… is not logged in".** Run the app's own login once in a terminal (`claude`, `gemini`,
`codex login`, `opencode auth login`), then **Check again** in Settings → AI.

**Ollama: "not running" or "has no models".** Start Ollama, and pull a model with tool calling
(`ollama pull qwen3:8b`).

**Local model gives odd or empty answers, or ignores tools.** Start Ollama with a longer context
(`OLLAMA_CONTEXT_LENGTH=32768 ollama serve`), try a bigger model, or give that agent simpler work.

**An agent stopped with a budget notice.** The project or agent budget is used up. Raise or remove
it: the budget button in the project chat header, or the helper's card on the Helpers page.

**Agents stopped talking to each other.** A chain of agent replies stops after 8 steps. Reply in the
chat to continue.

**Aura does not start after a customization.** Start with `AURA_SAFE_MODE=1` (or restart it three
times) and undo the change in Look.

**The phone cannot connect.** Start Aura with `AURA_REMOTE=1`, make sure both are on the same network,
and use the address shown in the pairing dialog.

Still stuck? [Open an issue](https://github.com/AerKov/aura/issues/new/choose) with the server log
lines around the problem (remove keys and personal data).

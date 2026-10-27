# Troubleshooting

**"Connect Claude Code" panel in the chat.** Claude Code is missing or not logged in. Install it, run
`claude` in a terminal and log in, then press **Check again**. Or pick another engine with **Use
another engine**.

**An engine says "not installed" although it is.** Apps started from the Dock or Start menu get a
short `PATH`. Set the path explicitly, for example `AURA_GEMINI_EXECUTABLE=/path/to/gemini` (the
pattern is `AURA_<NAME>_EXECUTABLE`; `AURA_CLAUDE_EXECUTABLE` for Claude Code).

**"… is not logged in".** Run the app's own login once in a terminal (`claude`, `gemini`,
`codex login`, `opencode auth login`), then **Check again** on the Engines page.

**Ollama: "not running" or "has no models".** Start Ollama, and pull a model with tool calling
(`ollama pull qwen3:8b`).

**Local model gives odd or empty answers, or ignores tools.** Start Ollama with a longer context
(`OLLAMA_CONTEXT_LENGTH=32768 ollama serve`), try a bigger model, or give that agent simpler work.

**OpenRouter: rate limit.** Free models are rate limited. Wait a bit, pick another free model, or add
credit.

**An agent stopped with a budget notice.** The project or agent budget is used up. Ask the
orchestrator to raise it, or start a new project.

**Agents stopped talking to each other.** A chain of agent replies stops after 8 steps. Reply in the
chat to continue.

**Aura does not start after a customization.** Start with `AURA_SAFE_MODE=1` (or restart it three
times) and undo the change on the Customize screen.

**The phone cannot connect.** Start Aura with `AURA_REMOTE=1`, make sure both are on the same network,
and use the address shown in the pairing dialog.

Still stuck? [Open an issue](https://github.com/AerKov/aura/issues/new/choose) with the server log
lines around the problem (remove keys and personal data).

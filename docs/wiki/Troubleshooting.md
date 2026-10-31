# Troubleshooting

**The Helper or @builder does not answer.** Open **Settings → AI**: the engine it uses must be ready
(a green mark). Ask the Helper "why doesn't @builder answer?"; it reads this guide.

**"Error: claude native binary not installed".** Claude Code was installed without its platform
part. Reinstall it: `curl -fsSL https://claude.ai/install.sh | bash` (or
`npm install -g @anthropic-ai/claude-code` without `--ignore-scripts`), then run `claude` once.

**"Connect Claude Code" panel in the chat.** Claude Code is missing or not logged in. Install it, run
`claude` in a terminal and log in, then press **Check again**, or pick another AI in Settings → AI.

**Claude Code says "not installed" although it is.** Apps started from the Dock or Start menu get a
short `PATH`. Set `AURA_CLAUDE_EXECUTABLE=/path/to/claude`.

**The local model does not start.** The card under Settings → AI says why. Try a smaller model, or
choose another llama.cpp build from the lists on the card.

**Ollama: "not running" or "has no models".** Start Ollama and pull a model with tool calling
(`ollama pull qwen3:8b`).

**A local model gives odd answers or ignores tools.** Start Ollama with a longer context
(`OLLAMA_CONTEXT_LENGTH=32768 ollama serve`), try a bigger model, or ask for smaller changes.

**A helper stopped with a budget notice.** Its budget is used up; ask the Helper to raise it.

**Helpers stopped talking to each other.** A chain of replies stops after 8 steps. Reply in the
chat to continue.

**An app shows a problem.** Its manifest asks for something Aura no longer has (an old bar app,
`replaces`): ask @builder in its chat to fix the manifest.

**Aura does not start after a change.** Start with `AURA_SAFE_MODE=1` (or restart it three times)
and ask the Helper to undo it.

Still stuck? [Open an issue](https://github.com/AerKov/aura/issues/new/choose) with the server log
lines around the problem (remove keys and personal data).

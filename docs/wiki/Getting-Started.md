# Getting started

## 1. Install

**From a release.** Download the installer for your system from
[Releases](https://github.com/AerKov/aura/releases). Builds are not signed yet:

- macOS: right-click Aura → **Open** the first time.
- Windows: on the SmartScreen warning choose **More info** → **Run anyway**.

**From source.** See [Development](Development). In short: install [Bun](https://bun.sh) and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), then

```sh
git clone https://github.com/AerKov/aura && cd aura
bun install
bun run dev
```

## 2. Pick an engine

Agents need something to think with. Open **Engines** (the chip icon in the left rail) and get one
engine to **Ready**. The quickest options:

| You have                      | Do this                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A Claude subscription         | Install Claude Code, run `claude` once and log in. Aura uses it automatically.                                          |
| A Google account              | `npm install -g @google/gemini-cli`, run `gemini` once and sign in (free tier).                                         |
| A decent GPU or Apple Silicon | Install [Ollama](https://ollama.com), `ollama pull qwen3:8b`, start it with `OLLAMA_CONTEXT_LENGTH=32768 ollama serve`. |
| Nothing yet                   | Create a free key at openrouter.ai/keys, paste it under OpenRouter, pick a model marked _free_.                         |

Then press **Use for all agents** on that engine. Details: [Engines](Engines).

## 3. Talk to the orchestrator

Aura opens with **Chats** on the whole screen and a welcome from your **orchestrator**, the first
chat in the list. It explains what Aura is; your apps will later sit next to it as tiles (see
[The screen](The-Screen)). Tell it what you want, in any language:

> I want a small CLI that converts temperatures, with tests.

The orchestrator asks what it needs, then proposes a **project**: a name, a team (for
example `@coder` and `@reviewer`). Nothing happens until you press **Approve** on that card.

## 4. Watch the team work

The project gets its own chat and its own folder (a git repository). Agents mention each other to
hand work over, every run shows a card with the tools it used and what it cost, and the files are
committed after each run. The button in the chat header shows the tokens used; click it to set a
limit.

You can step in at any time: just write in the project chat and the orchestrator passes it to the
right agent, reply to an agent's message to answer it, or type `@` to pick an agent yourself. Press
**Stop** on a running reply to end it.

## Next

- [Chats and agents](Chats-and-Agents) for how conversations and agents behave
- [The screen](The-Screen): the Home shelf, apps side by side, turning built-in apps off
- [Customization](Customization) to change the look or add tools by asking the orchestrator
- [Phone](Phone) to keep an eye on things from your phone

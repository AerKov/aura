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

Helpers need something to think with. In **My apps** (the **A** at the top of the bar) turn on
**Advanced mode**, open **Helper programs** and get one engine to **Ready**. The quickest options:

| You have                      | Do this                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A Claude subscription         | Install Claude Code, run `claude` once and log in. Aura uses it automatically.                                          |
| A Google account              | `npm install -g @google/gemini-cli`, run `gemini` once and sign in (free tier).                                         |
| A decent GPU or Apple Silicon | Install [Ollama](https://ollama.com), `ollama pull qwen3:8b`, start it with `OLLAMA_CONTEXT_LENGTH=32768 ollama serve`. |
| Nothing yet                   | Create a free key at openrouter.ai/keys, paste it under OpenRouter, pick a model marked _free_.                         |

Then press **Use for all agents** on that engine. Details: [Engines](Engines).

## 3. Talk to your Helper

Aura opens on **Chats**, with a welcome from your **Helper** (the orchestrator), the first chat in
the list. Tell it what you want, in any language:

> I run a small design studio. Keep track of my clients and deals, please.

The Helper asks what it needs, then makes an **app** (or, for bigger work, proposes a **project**
with a team, for example a coder and a reviewer). The new app appears in **My apps**; open it, and
use its **Chat** button to change it by asking. Every change comes as a card that says what will
change: nothing happens until you press **Yes, do it**.

![A decision card in an app's chat](https://raw.githubusercontent.com/AerKov/aura/HEAD/docs/assets/app-chat.png)

## 4. Watch the team work

A project has its own chat and its own folder (a git repository). Helpers mention each other to
hand work over, every run shows a short card of what it did and what it cost, and the files are
committed after each run. The ring in the chat header shows the tokens used; click it to set a
limit.

You can step in at any time: write in the project chat and the Helper passes it to the right agent,
reply to a message to answer it, or type `@` to pick a helper yourself. Press **Stop** on a running
reply to end it. **New group** at the top of the chat list makes a chat of your own with the
helpers you choose.

## Next

- [Chats and agents](Chats-and-Agents) for how conversations and agents behave
- [The screen](The-Screen): My apps, apps side by side, plain and advanced mode, backups, language
- [Customization](Customization) to change the look or add tools by asking the orchestrator
- [Phone](Phone) to keep an eye on things from your phone

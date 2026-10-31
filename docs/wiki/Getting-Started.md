# Getting started

## 1. Install

Download a build from [Releases](https://github.com/AerKov/aura/releases), or run from source with
[Bun](https://bun.sh) 1.4+ and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/):

```sh
git clone https://github.com/AerKov/aura && cd aura
bun install
bun run dev
```

## 2. Connect an AI

Open **Settings → AI**. The easiest start is the **Built-in local AI**: pick a model that fits your
computer and press **Yes, download**. Aura installs llama.cpp and the model and runs it only on
this computer. Ollama, LM Studio and Claude Code work too; see [The AI](Engines).

At the top of the tab, choose which AI **the Helper** uses and which one **builds your apps**
(@builder). A strong model for @builder makes better apps.

## 3. Make your first app

Click **Helper** in the sidebar and say what you need, in any language:

> Make me an app to track clients and deals.

The Helper proposes the app on a card; press **Yes, do it**. Or press **New app** in the sidebar
and give it a name and a sentence. The app opens with its chat beside it, and @builder starts
building. When it is done you get a card with what changed: look at the app with **After the
change**, then decide.

## 4. Change it

Keep talking in the app's chat: _"add an email column"_, _"make the Add button green"_,
_"export to CSV"_. Each change is a card; each approved change is a version you can go back to.

Want to look around first? `bun scripts/demo.ts` and `bun run --cwd apps/desktop dev:vite` start a
demo with sample apps.

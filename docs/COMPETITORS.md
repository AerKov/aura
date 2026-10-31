# Aura and its neighbours

A look at the tools that build apps from a conversation, as of October 2026, and where Aura stands
among them. Prices and numbers change often; the sources are listed at the end.

## The short version

Building an app by chatting is a crowded field, but almost every tool in it is made for one of
two people: a **developer or founder shipping a web product** (Lovable, Bolt, Replit, v0, Dyad,
bolt.diy), or someone who wants a **small AI-powered page in a cloud service** (Claude artifacts,
Google Opal). The apps live as projects to deploy or as pages on someone else's servers.

Aura is made for a third person: **someone who wants their own tools, on their own computer, and
never wants to see code.** The apps live together in one place, each with its data, its secrets
and a chat beside it where a helper changes it and uses it, and every change is a "yes or no" in
plain words. That combination is what we did not find elsewhere.

## The field

| Tool                         | Where it runs                                       | Who it is for                      | What you get                                                                                           | Open source                        | Price                                 |
| ---------------------------- | --------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------- |
| **Aura**                     | your computer, local model built in                 | people who want their own tools    | apps that live in Aura, each with its data, secrets and chat                                           | yes (MIT)                          | free                                  |
| **Dyad**                     | your computer (Electron), any model incl. Ollama    | developers, power users            | a React or Next.js project with a preview; data in Supabase or Neon                                    | Apache 2.0, Pro features under FSL | free with your keys; Pro about $20/mo |
| **bolt.diy**                 | self-hosted, in the browser, any model incl. Ollama | developers                         | a web project in an in-browser dev environment                                                         | MIT                                | free; you host it                     |
| **Lovable**                  | cloud                                               | founders, teams                    | a React + Supabase web app, exportable to GitHub                                                       | no                                 | from about $25/mo (credits)           |
| **Bolt.new**                 | cloud (in-browser)                                  | builders prototyping fast          | a web app deployed through Netlify                                                                     | no                                 | from about $20–25/mo (tokens)         |
| **Replit Agent**             | cloud                                               | builders who want hosting included | an app running in Replit's cloud                                                                       | no                                 | from about $25/mo (usage)             |
| **v0**                       | cloud                                               | front-end developers               | React user interfaces                                                                                  | no                                 | see Vercel                            |
| **Claude artifacts**         | cloud (claude.ai)                                   | Claude users                       | a page in the chat; persistent storage on paid plans, up to 20 MB, text only, deleted when unpublished | no                                 | Claude plans                          |
| **Google Opal**              | cloud (Google Labs, Gemini)                         | anyone                             | AI mini-apps as a visual chain of steps                                                                | no                                 | free (experimental)                   |
| **Patchwork** (Ink & Switch) | local-first research system                         | the researchers themselves         | small tools made in chat, living inside a shared environment                                           | research                           | not a product                         |

Next to these are **no-code builders** (Glide, Softr, Appsmith, ToolJet), which build apps over a
spreadsheet or a database with forms and drag and drop, and **local AI chat apps** (LM Studio, Jan,
GPT4All, Msty), which run a model on your computer but do not build apps.

## What sets Aura apart

1. **Apps live in one place, not as projects.** Every other builder hands you a codebase to run
   or deploy, or a page on its servers. In Aura an app is a tile in the sidebar: open it and use
   it. Each app has its own data store (its own database or plain files), its own secrets and
   its own permissions in a sandbox.
2. **No code in sight.** A change arrives as "what will change" in plain words, with a preview of
   the app after the change and **Yes, do it**; every version can be restored. Dyad and bolt.diy
   are local too, but they are developer tools: files, previews, deploys.
3. **The chat beside an app both changes it and uses it.** "Add a client Petrenko" runs through
   the app's own actions; "add an email column" changes its code. Builders change code; Aura's
   helper also works with the app's data.
4. **Local by default, with the model included.** Aura installs llama.cpp and a model that fits
   the computer; Ollama, LM Studio and Claude Code work too. No account, no telemetry, nothing in
   a cloud unless you choose a cloud model.
5. **Aura has no look of its own.** The theme is a file of yours, changed by asking.

Ink & Switch's Patchwork is the closest in spirit: a local-first environment where tools made in
chat gain abilities from living inside it. Their essay on malleable software argues the same point
Aura is built on: AI coding alone does not make software yours; an environment made for changing
it does.

## Where others are ahead

- **Shipping to the web.** Lovable, Bolt, Replit and v0 publish an app to the internet for others
  to use; Aura's apps are personal and stay on one computer.
- **Size and polish.** Dyad and bolt.diy have tens of thousands of GitHub stars and active
  communities; the cloud builders have large teams and the strongest models by default.
- **Phones.** Dyad can wrap an app for iOS and Android; Aura has no phone client yet.
- **Sharing.** Claude artifacts and Opal are shared with a link; Aura apps are not shared yet.

## Sources

- Dyad: [review, nocode.mba](https://www.nocode.mba/articles/dyad-review),
  [GitHub](https://github.com/dyad-sh/dyad), [site](https://www.dyad.sh/),
  [local AI with Ollama](https://www.dyad.sh/blog/local-ai-coding-ollama),
  [mobile apps](https://www.dyad.sh/blog/build-mobile-app-with-ai),
  [Neon (0.44.0)](https://www.dyad.sh/docs/releases/0.44.0),
  [1.14.0](https://www.dyad.sh/docs/releases/1.14.0),
  [review, techharry](https://www.techharry.com/2026/08/dyad-ai-app-builder-review.html),
  [SourceForge mirror](https://sourceforge.net/projects/dyad.mirror/)
- bolt.diy: [devtoollab](https://devtoollab.com/ai-tools/bolt-diy),
  [selfhostedworld](https://selfhostedworld.com/software/bolt-diy),
  [Railway template](https://railway.com/deploy/boltdiy-ai-app-builder)
- Open-source builders: [GitHub topic ai-app-builder](https://github.com/topics/ai-app-builder),
  [sandboxd](https://sandboxd.io/blog/best-open-source-ai-app-builders/),
  [Totalum](https://www.totalum.app/blog/open-source-ai-app-builder-self-hosted-alternatives),
  [hyperlambda](https://hyperlambda.dev/blog/open-source-ai-app-builders-compared)
- Lovable, Bolt, Replit, v0:
  [altar.io](https://altar.io/ai-app-builders-founders-comparison-2026/),
  [rework](https://resources.rework.com/tools/ai-coding/replit-vs-lovable-vs-bolt-new),
  [automationatlas](https://automationatlas.io/answers/replit-agent-vs-lovable-vs-bolt-new-2026/),
  [devtoolpicks](https://devtoolpicks.com/blog/lovable-vs-bolt-vs-replit-vs-v0-2026)
- Claude artifacts: [what artifacts are](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them),
  [publish and share](https://support.claude.com/en/articles/9547008-publish-and-share-artifacts),
  [artifacts in Cowork](https://support.claude.com/en/articles/14729249-use-artifacts-in-claude-cowork)
- Google Opal: [Google Developers blog](https://developers.googleblog.com/introducing-opal/),
  [the-decoder](https://the-decoder.com/google-launches-opal-build-ai-mini-apps-with-natural-language-no-coding-needed/),
  [Dataconomy, Feb 2026](https://dataconomy.com/2026/02/25/googles-opal-now-builds-interactive-apps-that-ask-you-for-feedback/)
- Malleable software: [Ink & Switch](https://inkandswitch.com/malleable-software/),
  [Simon Willison](https://simonwillison.net/2025/Jun/11/malleable-software),
  [Geoffrey Litt](https://buttondown.com/geoffreylitt/archive/new-essay-malleable-software)
- No-code and local AI apps: [Zite](https://www.zite.com/blog/no-code-ai-app-builder),
  [promptquorum](https://www.promptquorum.com/power-local-llm/local-ai-app-non-technical-users)

Many of these pages are reviews or vendor posts; check each project's own site for current terms.

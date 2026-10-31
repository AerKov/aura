# Customization

Aura is customized by talking to the orchestrator, in three levels. Each change is a file in
`~/.aura`, needs your approval, and is a git commit you can undo.

## Looks: themes and snippets

> Make the chat background a little warmer and the accent green.

Aura has no look of its own (ADR 0041): everything you see comes from a theme file of yours. On
the first start Aura puts its default look in `themes/default/theme.css`. Ask the Helper for any
change (_"make the bar green"_, _"round the corners"_, _"bigger text in chats"_): it proposes CSS,
**Try it** on the card shows it, and you approve or reject. Small tweaks can be snippets
(`snippets/<name>.css`).

Each part of the screen has its own colours: the bar (`--bar-bg`, `--bar-fg`, `--bar-active-bg`),
My apps (`--menu-bg`), windows (`--tile-bg`, `--tile-border`), their title bars (`--tile-title-bg`),
the chat list (`--chat-list-bg`), a conversation (`--chat-bg`), your bubbles (`--bubble-own`) and the
message box. They start from the base colours (`--background`, `--foreground`, `--primary`,
`--signal`…) and `--radius`. Remote fonts and images are not allowed in theme CSS.

## Your own version of a built-in app

Aura is like Linux and its apps like the GNU tools: any of them can be yours. Ask the Helper for
your own Chats, Alerts or Settings (_"make me my own chat list with big avatars"_): it makes an app
that takes their place (`"replaces": "chats"` in its manifest) and opens wherever the built-in one
would. You change its code in its chat like any app. Turn it off or remove it, or start in safe
mode, and the built-in one is back.

## Tools: MCP servers

> Connect a GitHub MCP server for @coder.

MCP servers give agents new tools. Add them yourself on the [Agents](Agents) page, under Tool servers, or
ask the orchestrator and approve its card, which shows the exact command that will run. They are
listed in `mcp/servers.json` and granted per agent. Secrets are never written to the file.

MCP servers work with every engine. Aura does not use the servers you set up in Claude Code itself
(`claude mcp list`): agents get exactly the servers listed here.

## Apps: extensions

> Make a panel for this project with a form that files a ticket in our tracker.

Extensions are small JavaScript apps in `extensions/<id>/`. They open as tiles on
[the screen](The-Screen), from their icon in the rail, and know which chat (and project) is open
in Chats, so they can work next to it. **Apps** in a chat's header opens one next to that chat.

**Project apps.** Pin an extension to a project with the pin button in its tile's bar while the
project's chat is open, or ask the orchestrator for an app for a project. **Apps** in that
project's chat header then opens it beside the chat. Nothing opens by itself.

Extensions run in a sandbox and can do only what you approved when you installed or enabled them:

| Permission    | What it allows                                                                  |
| ------------- | ------------------------------------------------------------------------------- |
| `ui.panel`    | Show a panel (and forms and buttons in it)                                      |
| `chat.read`   | Read chats and messages                                                         |
| `chat.write`  | Post messages as the extension (they never wake agents)                         |
| `alerts.read` | Read alerts                                                                     |
| `storage`     | Keep its own data (not in your chats)                                           |
| `net`         | Reach the hosts listed on the card, through Aura                                |
| `agents.ask`  | Ask an agent for you: posts your message `@agent …` in the chat, within budgets |
| `files.read`  | Read a project's files (read-only)                                              |
| `docs`        | Keep its own files, let you add and save them, and show them (PDF, images)      |

**Network and keys.** An extension cannot reach the internet by itself. With `net`, Aura makes the
request for it, only to the hosts shown on the install card. If it needs a key, the card also names
the secret; store it in the app's **Secrets** (the key button on its tile). Aura puts the key into
the request and hides it in the answer, so the extension never sees it.

**Asking agents.** A button or form that asks an agent posts a message from you, so the agent must
be in the chat and the usual budgets and limits apply (at most 10 requests a minute per extension).

An extension that keeps crashing is turned off automatically. **Remove** (the bin on its card)
deletes its files and its data as one commit in your data folder, so the files can be restored from
history.

## Navigation

Ask the Helper to order the bar's icons or hide the ones you do not use (_"move the tracker app to
the top"_); Chats and Settings always stay. Extensions pick
their icon from Aura's set.

## Safe mode

If a customization breaks Aura, start it with `AURA_SAFE_MODE=1`, or simply restart it a few times:
after 3 starts in a row that did not last a minute, Aura starts in safe mode by itself. Safe mode
turns off MCP servers and apps so you can fix things by asking the Helper.

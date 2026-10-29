# Customization

Aura is customized by talking to the orchestrator, in three levels. Each change is a file in
`~/.aura`, needs your approval, and is a git commit you can undo.

## Looks: themes and snippets

> Make the chat background a little warmer and the accent green.

The orchestrator proposes CSS. Press **Try it** on the card to preview, then approve or reject.
Themes live in `themes/<name>/theme.css`, small tweaks in `snippets/<name>.css`. The **Look**
screen (palette icon) switches themes and snippets on and off.

Themes change CSS variables such as `--background`, `--foreground`, `--primary` (the accent),
`--signal`, `--sidebar`, `--rail`, `--chat-bg`, `--grid-dot`, `--bubble-own`, `--bubble-other` and
`--radius`. Remote fonts and images are not allowed in theme CSS.

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

The **Navigation** list in Look sets the order of the icons on the left and hides the
ones you do not use (Chats and Look always stay). Items after Look sit at the bottom. You
can also ask the orchestrator ("move the tracker app to the top, hide Memory"). Extensions pick
their icon from Aura's set.

## Safe mode

If a customization breaks Aura, start it with `AURA_SAFE_MODE=1`, or simply restart it a few times:
after 3 starts in a row that did not last a minute, Aura starts in safe mode by itself. Safe mode
turns off MCP servers and extensions so you can fix things from Look.

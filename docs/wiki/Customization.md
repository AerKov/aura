# Customization

Aura is customized by talking to the orchestrator, in three levels. Each change is a file in
`~/.aura`, needs your approval, and is a git commit you can undo.

## Looks: themes and snippets

> Make the chat background a little warmer and the accent green.

The orchestrator proposes CSS. Press **Try it** on the card to preview, then approve or reject.
Themes live in `themes/<name>/theme.css`, small tweaks in `snippets/<name>.css`. The **Customize**
screen (palette icon) switches themes and snippets on and off.

Themes change CSS variables such as `--background`, `--foreground`, `--primary` (the accent),
`--signal`, `--sidebar`, `--rail`, `--chat-bg`, `--grid-dot`, `--bubble-own`, `--bubble-other` and
`--radius`. Remote fonts and images are not allowed in theme CSS.

## Tools: MCP servers

> Connect a GitHub MCP server for @coder.

MCP servers give agents new tools. They are listed in `mcp/servers.json` and granted per agent. The
approval card shows the exact command that will run. Secrets are never written to the file: use
`${env:NAME}` references and set the variable in the environment that starts Aura.

MCP servers work with every engine.

## Panels: extensions

> Add a panel that shows today's alerts with their severity.

Extensions are small JavaScript apps in `extensions/<id>/` that add panels to the left rail. They run
in a sandbox: no network, no storage, no access to the app except the permissions you approved
(`chat.read`, `chat.write`, `ui.panel`, `alerts.read`). Messages they post never wake agents. An
extension that keeps crashing is turned off automatically.

## Safe mode

If a customization breaks Aura, start it with `AURA_SAFE_MODE=1`, or simply restart it a few times:
after 3 starts in a row that did not last a minute, Aura starts in safe mode by itself. Safe mode
turns off MCP servers and extensions so you can fix things from the Customize screen.

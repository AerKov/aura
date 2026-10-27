# 0008: Customization by chat (themes, MCP servers, UI extensions, safe mode)

- Status: accepted
- Date: 2026-10-27
- Phase: 6

Everything lives in the user data repo (`~/.aura`) and every change is an approved, committed diff. The
orchestrator gets the customization tools only in the direct chat.

## Tier 1: looks

- `themes/<name>/theme.css` and `snippets/<name>.css`; the active theme and snippets are a setting in
  the DB. CSS is sanitized before it is served or tried on (no `@import`, no remote `url()`, no
  `expression()`, no `</style`).
- `propose_css` creates an approval whose card has **Try it**: the client applies the sanitized CSS until
  the user decides. Switching among existing themes (`set_appearance`, or the Customize screen) needs
  no approval: it is harmless and reversible.
- Themes override CSS variables (shadcn tokens plus `--sidebar`, `--chat-bg`, `--bubble-own`,
  `--bubble-other`).

## Tier 2: MCP servers

- `mcp/servers.json`: `{ servers: { name: { command, args, env, agents } | { url, agents } } }`. An
  approval shows the exact command that will run. `env` values must be `${env:NAME}` references, so
  secrets never land in git (OS keychain storage is future work).
- Granted per agent: the provider adds the server to the run and `canUseTool` allows `mcp__<name>__*`
  only for those agents.

## Tier 3: UI extensions

- `extensions/<id>/manifest.json` (`id`, `name`, `version`, `minAppVersion`, `permissions`, `author`),
  `main.js` (`export default function activate(ctx)`), `styles.css`.
- Sandbox: the extension runs in an `<iframe sandbox="allow-scripts">` served by the server at
  `/extensions/<id>/frame`, so it has an opaque origin, no storage and no access to the app. Its CSP is
  `default-src 'none'; script-src 'unsafe-inline' blob:; connect-src 'none'` (no network) with
  `frame-ancestors` limited to the app. `main.js` is imported from a blob URL inside the frame.
- Bridge: the frame can only `postMessage` to the parent. The host checks every request against the
  granted permissions (`chat.read`, `chat.write`, `ui.panel`, `alerts.read`), and the server checks
  `chat.write` again. Extension posts do not wake agents (an extension cannot spend budget). The host
  also sends the theme tokens so panels match the app.
- Install: through an approval that shows permissions and code; approved extensions are enabled with
  exactly the requested permissions. Folders added by hand stay disabled until enabled on the Customize
  screen. `minAppVersion` is checked; 3 runtime errors disable an extension.

## Safe mode

`AURA_SAFE_MODE=1`, or automatically after 3 starts in a row that did not run for a minute: no MCP
servers and no extensions (tiers 2-3), with a banner on the Customize screen.

## Notes

- The SPEC's `ctx.commands.register` and `ctx.chat.registerCard` are not implemented yet; the API is
  `ui.registerPanel`, `chat.list/messages/post`, `alerts.recent`, `events.on("message.created")`.

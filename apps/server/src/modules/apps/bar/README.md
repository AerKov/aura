# Aura's bar

This app is Aura's bar (ADR 0029). It runs in a sandboxed frame on the edge of the screen the user
chose. Change `main.js` and `styles.css`.

## Permissions

`manifest.json` lists what the bar may do, like any app's:

- `ui.bar` (required): be the bar, `ctx.bar` below. Only this app may have it.
- `storage`: keep its own data (`ctx.storage`), e.g. the user's widget settings.
- `net` with `hosts` (and `secrets`): reach those hosts through Aura with `ctx.net.fetch`, e.g. a
  weather widget with `"hosts": ["api.open-meteo.com"]`. Nothing else is reachable.
- Any other app permission works the same as in other apps (`alerts.read`, `chat.read`…).
  `ui.panel` makes no sense here: the bar is never a tile.

Adding a permission, host or secret is shown in bold on the change's approval card; until the
user approves, the bar keeps what it had. An unknown permission makes the manifest invalid: the bar
does not load and the built-in bar stands in until a valid version is restored.

The bar's API, `ctx.bar`:

- `state()`: resolves to the bar's state:
  - `edge`: `left` | `right` | `top` | `bottom`; `vertical`: true for `left` and `right`.
  - `size`: the strip's thickness in px (its width on the sides, its height on top or bottom).
  - `home`: `{ key: "home", label, svg, active }`.
  - `items`: the user's apps in their order, each `{ key, label, svg, active, shortcut }`. `svg` is
    the icon's markup (24×24, `currentColor`); `shortcut` is like `Alt+1` or null.
  - `status`: `{ approvals, working, connection }`: approvals waiting, agents working,
    `open` | `connecting` | `closed`.
  - `mod`: the shortcuts' Mod key (`alt`, `ctrl-alt`, `meta`).
- `on(fn)`: calls `fn(state)` whenever it changes (apps opened, status, theme).
- `open(key, where)`: opens an app by its key (`home`, `chats`, `skills`, `ext:<id>`…) `here`
  (the focused tile, default), `right` or `below`.
- `menu(items)`: shows a menu outside the bar's frame, `items` like `[{ label, value }]`;
  resolves to the chosen `value` or null.

The theme's colours are CSS variables (`--background`, `--foreground`, `--primary`, `--accent`,
`--muted-foreground`, `--border`…). The bar is 56 px wide on the left or right and 48 px high on
the top or bottom, unless the user sets another thickness (24–96 px, `state().size`); fill the
frame (`height: 100%`) and it fits whatever the size. It cannot draw outside that, so use `menu` for lists and the `title` attribute
for tooltips. If the bar fails to start or reports an error, Aura shows its built-in bar instead.

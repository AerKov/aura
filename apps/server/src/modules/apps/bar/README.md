# Aura's bar

This app is Aura's bar (ADR 0029). It runs in a sandboxed frame on the edge of the screen the user
chose. Change `main.js` and `styles.css`; keep `manifest.json`'s permissions to `ui.bar` and
`storage`.

The bar's API, `ctx.bar`:

- `state()`: resolves to the bar's state:
  - `edge`: `left` | `right` | `top` | `bottom`; `vertical`: true for `left` and `right`.
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
the top or bottom; it cannot draw outside that, so use `menu` for lists and the `title` attribute
for tooltips. If the bar fails to start or reports an error, Aura shows its built-in bar instead.

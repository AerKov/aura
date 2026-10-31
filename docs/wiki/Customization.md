# The look and the language

Aura is changed by asking the Helper. Each change is a file in `~/.aura`, waits for your approval,
and is a git commit you can undo.

## The look

> Make the sidebar a little warmer and the corners rounder.

Aura has no look of its own (ADR 0041): everything you see comes from a theme file of yours. On the
first start Aura puts its default look in `themes/default/theme.css`. Ask the Helper for any change:
it proposes CSS, **Try it** on the card shows it, and you approve or reject. Small tweaks can be
snippets (`snippets/<name>.css`).

The default look comes from Aura's mark: layers of an aura from a deep blue edge to a light core,
on an ink tile. Everything in it is a variable:

- **The mark:** `--ink` (its tile, also the sidebar) and `--layer-1` … `--layer-5` (its blues, from
  the edge to the core: buttons, bubbles, rings, the faint aura behind everything).
- **Shape and motion:** `--radius`, `--radius-pill`, `--shadow-sm/md/lg`, `--ease`, `--spring`.
- **Parts:** the sidebar (`--sidebar-bg`, `--sidebar-fg`, `--sidebar-active-bg`), the card an app
  runs on (`--app-bg`, `--app-border`), a conversation (`--chat-bg`), your bubbles (`--bubble-own`,
  a colour or a gradient), the message box (`--input-bg`), dialogs (`--menu-bg`).
- **Base colours and fonts:** `--background`, `--foreground`, `--primary`, `--muted`, `--border`,
  `--font-body`, `--font-heading`, `--font-code`.

Each part is also marked `data-part="<name>"` for a change no variable covers. Remote fonts and
images are not allowed in theme CSS. If your system asks for less motion, Aura stops animating.

## The language

> Speak Ukrainian.

Ask the Helper, or pick it at the top right of **Settings**: **Auto** (follows this computer),
**English** or **Українська**. One language for the interface, the helpers and your apps. English and Ukrainian are built in;
translations of your own go in `locales/<code>.json`.

## Safe mode

If a change breaks Aura, start it with `AURA_SAFE_MODE=1`, or restart it a few times: after 3 starts
in a row that did not last a minute, Aura starts in safe mode by itself. Apps are off in safe mode,
so you can fix things by asking the Helper.

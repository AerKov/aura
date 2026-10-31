# 0041: Aura has no look of its own; built-in apps are replaceable

- Status: accepted
- Date: 2026-10-31
- Phase: 38 (follows ADR 0039 and 0040)

## Context

The user asked the Helper to change the bar's background and it could not: the bar's colour was a
variable named `--rail`, mentioned only in one tool's text, and a few dozen places in the interface
had colours written in the code. The Look tab duplicated what the Helper does. The user's model is
Linux: Aura is the kernel, the apps are like the GNU tools, and everything is changed by asking.

## Decision

- **No look of its own.** Every colour, font and corner is a variable in
  `packages/shared/src/look/default-theme.css`. The desktop app imports it; on the first start it
  becomes the user's `themes/default/theme.css` and the active theme. The Helper changes it there
  like any theme, with an approval card and a try-on.
- **Named parts.** Each part of the screen has its own variables and a `data-part` mark (bar, menu,
  tile, tile-title, chat-list, chat, bubble-own, composer), listed in `LOOK_PARTS` with the base
  tokens in `LOOK_TOKENS`. `describe_look` gives the Helper the list and the active theme's CSS, so
  "make the bar green" names `--bar-bg`. No colour is written in the interface's code.
- **No Look tab.** Themes, windows, the bar and the language are changed by asking the Helper
  (`propose_css`, `set_appearance`, `set_language`).
- **Replaceable built-in apps.** An app's manifest may say `"replaces": "chats" | "signals" |
  "settings"`; enabled, it opens wherever that built-in app would (the bar, My apps, Settings
  links), and the built-in one is not listed. Turned off, removed or in safe mode, the built-in one
  is back. `create_app` takes `replaces`; @builder is told what the app takes the place of.
- **The code of every app can be changed by the Helper.** The user's apps are git folders changed
  in their chats. Aura's own code stays read-only at runtime (CLAUDE.md rule 9): the user's version
  of a built-in app is an app of theirs, made to replace it, like the bar app (ADR 0029).

## Consequences

- Old themes that set `--rail`/`--rail-foreground` need `--bar-bg`/`--bar-fg` (the catalog's themes
  are updated).
- Links inside Aura that open one chat (a notification, a helper's mark) still open the built-in
  Chats.

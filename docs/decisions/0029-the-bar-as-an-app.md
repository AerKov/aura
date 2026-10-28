# 0029: The bar as an app

- Status: accepted
- Date: 2026-10-28
- Phase: 31

## Context

After the tiling look (ADR 0028) the user wants the bar to be customizable like everything else:
not only its edge and icons, but its code, changed through the orchestrator, with their approval
and versions to go back to. They also want to be able to turn the bar off. A broken bar must not
leave them without navigation.

## Decision

- **Three bars** (`rail.mode` in the appearance settings): Aura's built-in bar (default), the
  user's **bar app**, or **off** (Home with Mod+H and the keyboard; phones keep their tab bar).
- **The bar app is an app** with the id `bar` (ADR 0024): code in `~/.aura/projects/bar`, a chat
  with @builder, every change a diff on an approval card, a draft to try, versions to restore. It
  is created the first time the user picks "Your own" or the orchestrator calls `change_bar`, and
  starts as the built-in bar written in plain JavaScript, with a README describing its API.
- **`ui.bar`**, a permission only the app `bar` may hold, gives its frame `ctx.bar`: `state()`
  (edge, the apps with their icons as SVG, which are open, shortcuts, approvals waiting, agents
  working, the connection), `on(fn)` for changes, `open(key, where)` and `menu(items)`, shown by
  Aura outside the frame, since a frame cannot draw beyond its 56 px (or 48 px) strip.
- **The built-in bar stands in** when the bar app is missing, turned off after errors, in safe
  mode, reports an error, or does not ask for its state within 8 seconds. Customize says why and
  offers to try again; a new version gets a new chance.
- **The orchestrator** sets the bar's mode, edge and icons with `set_appearance`, and hands deeper
  changes to @builder with `change_bar` (which switches to the bar app); the user approves the
  diff in the bar's chat.

## Consequences

- The bar can become anything the frame can draw, and every step is reversible.
- Keyboard shortcuts stay in the shell, so they work whatever the bar app does.
- The bar app's chat appears among the apps' chats.

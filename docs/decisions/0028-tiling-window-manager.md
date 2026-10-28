# 0028: The shell as a tiling window manager

- Status: accepted
- Date: 2026-10-28
- Phase: 30

## Context

The user likes tiling window managers (Hyprland, i3, sway) and wants Aura to look and work like
one: tiles with gaps and borders, a bar that can sit on any edge, status in the bar and keyboard
control. Tastes differ (Hyprland's soft gaps against i3's dense grid), so the look is a setting.

## Decision

- **Window style** (`Appearance.wm`): gaps (0–24 px), corner radius (0–24 px), border (0–4 px),
  title bars (`full`, `minimal`: thin with buttons on hover, `none`: buttons appear over the tile
  on hover) and the shortcuts' Mod key. Presets: **Hyprland** (8, 12, 2, minimal) is the default,
  **i3** (0, 0, 1, full). Stored with the theme in the appearance settings and applied as CSS
  variables (`--wm-gap`, `--wm-radius`, `--wm-border`), so themes can use them too. The focused
  tile gets the accent border.
- **The bar** (`rail.edge`) sits on the left, right, top or bottom. It ends with the status:
  approvals waiting (opens Chats), agents working, the clock and the connection. Phones keep the
  tab bar at the bottom.
- **Shortcuts**: Mod+arrows focus the tile in that direction (by the tiles' rectangles, across
  gaps), Mod+Shift+arrows swap it with that tile, Mod+Enter opens Home in a new tile on the right
  (Shift: below), Mod+Q closes the tile, Mod+H opens Home, Mod+1…9 open the bar's apps. Mod is
  Alt, Ctrl+Alt (Option+digits type symbols on macOS) or Super; keys are read by position. In a
  text field Mod+arrows keep moving by word. Keys pressed inside an app's sandboxed frame do not
  reach the shell.
- **Home is a launcher**: unlike other apps it may show in several tiles, as a new terminal does in
  a tiling window manager; opening an app from it replaces it.
- The orchestrator changes all of it with `set_appearance` (a preset, single values, the bar's
  edge), without approval: it is harmless and reversible.

## Consequences

- The tiles' look is no longer fixed in the components; new chrome must use the `--wm-*`
  variables.
- Shortcuts inside app frames need forwarding from the frame (later, possibly through Tauri).

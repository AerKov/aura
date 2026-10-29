# 0034: The Industry look, a plain interface by default, the "My apps" menu

- Status: accepted
- Date: 2026-10-29
- Phase: 36 (37–39 continue it)

## Context

Claude Design's round 4 ("simple mode", `docs/design/round4/`) redesigned Aura for non-technical users:
the "Industry" visual system, plain words in Ukrainian and English, technical detail behind an
advanced mode, a Start-menu-like "My apps" menu over the tiles, a chat with calmer cards, one
"Helpers" app for everything about agents, and a first-run onboarding. The user chose Industry
over the earlier soft Geist look and asked for the plain texts in both languages.

## Decision

- **Industry tokens.** Square corners (`--radius: 0`), hairline borders, steel blue as the one
  signal colour, Barlow for text and Barlow Condensed for headings (Geist Mono for numbers and
  code), the round-4 colour tokens for light and dark, plus `--warning`, `--signal-text`,
  `--input-bg` and shadows. The whole radius scale derives from `--radius`, and pills from
  `--radius-pill`, so a theme can bring soft corners back. Hyprland tiles are 10 / 10 / 2.
- **Marks.** Agents are squares told apart by fill style (solid primary for the orchestrator,
  solid ink for @builder, tint, outline, dashed), not by hue, so they work with any theme; people
  are round.
- **Plain by default, advanced on request.** `appearance.advanced` (a switch in "My apps", and
  `set_appearance advanced`) shows technical names, details and every app. Plain names: Chats,
  Alerts, Reminders, Helpers, Look, Language, Phone, Backups, Ready-made packs; Skills, Memory and
  Helper programs only in advanced mode until Helpers holds them (phase 38).
- **"My apps" menu.** The A at the top of the bar (and Mod+H) opens a panel over the tiles with
  every app by group (the user's, then Essentials and Settings), a search (Enter opens the first
  match), a first-run "How it all works" card and the advanced switch. An empty tile ("New
  window") shows the same list, with the user's apps' uninstall menu and, in advanced mode, the
  built-in apps' switches. "New app" is a sheet on the right.
- **Bar and tiles.** The bar is the deep `--rail` with an "A" logo, 38px items, a 2px mark for
  apps in tiles (full for the focused one), and the clock, the connection dot and an amber count
  of decisions waiting. A tile bar is 38px with "Open another app here", "New window beside" and
  "Close".
- **Texts.** English keys stay the source; the Ukrainian dictionary carries round 4's words.

## Consequences

- Pages not redesigned yet get the new tokens and titles only; chats and app tiles (37), Helpers
  (38) and onboarding (39) follow.
- Themes written for the soft look should set `--radius` and `--radius-pill`.

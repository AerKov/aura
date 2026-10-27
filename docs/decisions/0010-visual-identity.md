# 0010: Aura's visual identity

- Status: accepted
- Date: 2026-10-27
- Phase: 8

The first UI followed Telegram closely (chat list + bubbles). Aura is a place where you work _with_ a
team of agents, so the design now says that.

## Principles

- **Presence, not avatars.** Every participant is an orb: a sphere tinted by its name (a stable hue
  per agent). The orchestrator wears the aura gradient. An orb breathes while its agent is working, in
  the chat list, the chat header (team) and next to its message.
- **Conversation as a document.** Agents write full-width prose next to their orb, with name, handle
  and time on one line; their run, approval, task and alert cards sit inside the flow. The user's own
  messages are compact notes on the right. System events are quiet dividers.
- **Navigation is a rail.** A slim dark rail (desktop) / tab bar (phone) holds Chats, Skills,
  Schedule, extension panels, Customize and Devices; an amber dot marks waiting approvals. The chat
  list groups conversations into "With you", "Projects" and "Signals".
- **The composer is a floating command bar** with an aura border and a gradient send button.
- **Type:** Geist (UI), Geist Mono (code), Fraunces (titles and headings). Fonts are bundled
  (`@fontsource-variable/*`, OFL), never loaded from a CDN (local-first, strict CSP).
- **Color:** light "paper" (warm neutrals) and dark "ink" (deep violet), following the system setting;
  the accent is an iris → amber gradient (`--aura-1`, `--aura-2`). Project budgets are rings.
- **Motion** is small (message fade-in, orb breathing) and disabled with `prefers-reduced-motion`.

## Compatibility

All colors are CSS variables, so user themes (Phase 6) restyle everything; new tokens are `--rail`,
`--rail-foreground`, `--aura-1`, `--aura-2` (documented to the orchestrator in `list_customizations`).

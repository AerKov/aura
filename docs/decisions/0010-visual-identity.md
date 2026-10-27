# 0010: Aura's visual identity ("Workbench")

- Status: accepted (revised after feedback: the first take used violet gradients and glowing orbs,
  which read as a generic "made with AI" look)
- Date: 2026-10-27
- Phase: 8

Aura is a workbench where you work with a team of agents, not a magic chat. The design is calm,
precise and built from few elements; inspiration is the restraint of tools like Zed's website, not
a copy of it.

## Principles

- **Paper and ink.** Light (default with a light system setting) is warm off-white paper with ink text;
  dark is neutral graphite, never tinted violet.
- **One signal colour.** Vermilion (`--signal`, `--primary`) marks what needs attention: the active
  chat, waiting approvals, working agents, the send button. Everything else is neutral.
- **Hairlines.** Structure comes from 1px rules and small radii (6-8px), not shadows and gradients. A
  faint dot grid sits behind conversations.
- **Monospace labels.** Section names, authors' handles, times, keyboard hints and card headers
  (`APPROVAL · @ORCHESTRATOR`) are small uppercase Geist Mono. Text is Geist.
- **Agents are marks.** Square monogram tiles tinted by the agent's name (stable hue); the orchestrator
  is an ink tile with the signal diamond ◆. A working agent gets a small pulsing signal square and a
  `● working` label, nothing glows.
- **Conversation as a document.** Agents write full-width prose next to their mark; the user's
  messages are compact bordered notes on the right; system events are thin dividers.
- **Navigation** is a slim rail (desktop) / tab bar (phone); conversations are grouped into
  Orchestrator, Projects and Signals. The composer is a plain bordered box with keyboard hints.
- **Motion** is minimal and disabled with `prefers-reduced-motion`. Fonts are bundled (OFL).

## Compatibility

All colours are CSS variables, so user themes (Phase 6) restyle everything. Tokens added for themes:
`--rail`, `--rail-foreground`, `--signal`, `--grid-dot`, `--bubble-own`, `--bubble-other`.

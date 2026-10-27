# 0010: Aura's visual identity ("Workbench")

- Status: accepted (revised twice after feedback: violet gradients and glowing orbs read as a generic
  "made with AI" look; warm paper with a vermilion accent then read as Claude's own brand)
- Date: 2026-10-27
- Phase: 8

Aura is a workbench where you work with a team of agents, not a magic chat. The design is calm,
precise and built from few elements; inspiration is the restraint of tools like Zed's website, not
a copy of it.

## Principles

- **Cool and airy.** Light is a near-white, slightly cool surface with slate ink; dark is deep slate.
  No warm beige, no violet.
- **One signal colour.** A clear blue (`--signal`, `--primary`) marks what needs attention: the active
  chat, waiting approvals, working agents, the send button. Everything else is neutral.
- **Soft shapes, hairlines.** Generous radii (14px base, pills for rows and buttons), 1px rules
  instead of shadows and gradients. A faint dot grid sits behind conversations.
- **Monospace labels.** Section names, authors' handles, times, keyboard hints and card headers
  (`APPROVAL · @ORCHESTRATOR`) are small uppercase Geist Mono. Text is Geist.
- **Logo.** A lowercase "a" whose bowl is a ring (an aura) around a glowing blue core, white on an
  ink tile (`docs/assets/logo.svg`, `components/logo.tsx`). It replaced a white diamond on a blue
  gradient, which looked too much like Gemini's spark.
- **Agents are marks.** Rounded (squircle) monogram tiles tinted by the agent's name (stable hue); the
  orchestrator is a solid blue tile with the Aura glyph. A working agent gets a small pulsing dot and a
  `● working` label, nothing glows.
- **Conversation as a document.** Agents write full-width prose next to their mark; the user's
  messages are soft blue notes on the right; system events are thin dividers.
- **Navigation** is a slim rail (desktop) / tab bar (phone); conversations are grouped into
  Orchestrator, Projects and Signals. The composer is a plain bordered box with keyboard hints.
- **Motion** is minimal and disabled with `prefers-reduced-motion`. Fonts are bundled (OFL).

## Compatibility

All colours are CSS variables, so user themes (Phase 6) restyle everything. Tokens added for themes:
`--rail`, `--rail-foreground`, `--signal`, `--grid-dot`, `--bubble-own`, `--bubble-other`.

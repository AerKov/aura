/**
 * The parts of Aura's screen a theme can change (ADR 0041). Aura has no look of its own: the
 * default theme (look/default-theme.css, copied to themes/default/theme.css) sets these variables,
 * and every part is marked `data-part="<name>"` for the rare change a variable cannot make. The
 * Helper reads this list to know what "the bar" or "my bubbles" is.
 */
export interface LookPart {
  part: string;
  /** What the user calls it. */
  label: string;
  /** Its own variables, each with what it changes. */
  vars: Record<string, string>;
}

export const LOOK_PARTS: LookPart[] = [
  {
    part: "bar",
    label: "the bar (the strip with the app icons)",
    vars: {
      "--bar-bg": "background",
      "--bar-fg": "icons and text",
      "--bar-active-bg": "behind the app that is open",
    },
  },
  {
    part: "menu",
    label: "My apps and the New app sheet",
    vars: { "--menu-bg": "background", "--menu-fg": "text" },
  },
  {
    part: "tile",
    label: "a window (tile) with an app",
    vars: {
      "--tile-bg": "background",
      "--tile-border": "border",
      "--wm-radius": "corners",
      "--wm-gap": "space between windows",
      "--wm-border": "border width",
    },
  },
  {
    part: "tile-title",
    label: "a window's title bar",
    vars: { "--tile-title-bg": "background", "--tile-title-fg": "text" },
  },
  { part: "chat-list", label: "the list of chats", vars: { "--chat-list-bg": "background" } },
  {
    part: "chat",
    label: "a conversation",
    vars: { "--chat-bg": "background", "--grid-dot": "the dot grid" },
  },
  {
    part: "bubble-own",
    label: "the user's own messages",
    vars: { "--bubble-own": "background", "--bubble-own-foreground": "text" },
  },
  {
    part: "composer",
    label: "the message box",
    vars: { "--input-bg": "background", "--input": "border" },
  },
];

/** Colours, fonts and corners everything else is made of. */
export const LOOK_TOKENS: Record<string, string> = {
  "--background": "the page",
  "--foreground": "text",
  "--card": "cards and panels",
  "--popover": "menus and pop-ups",
  "--primary": "buttons and links",
  "--primary-foreground": "text on buttons",
  "--muted": "quiet surfaces",
  "--muted-foreground": "secondary text",
  "--accent": "highlights",
  "--border": "lines",
  "--ring": "focus",
  "--signal": "the one accent colour",
  "--success": "done, ready",
  "--warning": "needs attention",
  "--destructive": "errors, deleting",
  "--paper": "the page under a PDF or image",
  "--radius": "every corner (0 square, 9999px round)",
  "--radius-pill": "chips and small buttons",
  "--font-body": "text font",
  "--font-heading": "headings font",
  "--font-code": "code font",
};

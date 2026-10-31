/**
 * The parts of Aura's screen a theme can change (ADR 0041). Aura has no look of its own: the
 * default theme (look/default-theme.css, copied to themes/default/theme.css) sets these variables,
 * and every part is marked `data-part="<name>"` for the rare change a variable cannot make. The
 * Helper reads this list to know what "the sidebar" or "my bubbles" is.
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
    part: "sidebar",
    label: "the sidebar (the Helper, the apps, Settings)",
    vars: {
      "--sidebar-bg": "background (the mark's ink by default)",
      "--sidebar-fg": "text and icons",
      "--sidebar-active-bg": "behind what is open",
      "--sidebar-active-fg": "text of what is open",
    },
  },
  {
    part: "app",
    label: "the card an app runs in",
    vars: { "--app-bg": "background", "--app-border": "border" },
  },
  { part: "chat", label: "a conversation", vars: { "--chat-bg": "background" } },
  {
    part: "bubble-own",
    label: "the user's own messages",
    vars: {
      "--bubble-own": "background (a colour or a gradient)",
      "--bubble-own-foreground": "text",
    },
  },
  {
    part: "composer",
    label: "the message box",
    vars: { "--input-bg": "background", "--input": "border" },
  },
  {
    part: "menu",
    label: "dialogs such as New app",
    vars: { "--menu-bg": "background", "--menu-fg": "text" },
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
  "--ink": "the mark's dark tile (also the sidebar)",
  "--layer-1": "the mark's outer layer, deep blue",
  "--layer-2": "the mark's second layer (buttons, bubbles)",
  "--layer-3": "the mark's third layer (rings, glows)",
  "--layer-4": "the mark's fourth layer, light blue",
  "--layer-5": "the mark's core, almost white",
  "--shadow-md": "cards' shadow",
  "--ease": "how things move",
  "--radius": "every corner (0 square, 9999px round)",
  "--radius-pill": "chips and small buttons",
  "--font-body": "text font",
  "--font-heading": "headings font",
  "--font-code": "code font",
};

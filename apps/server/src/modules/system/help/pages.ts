/// <reference path="../../../providers/vendor-files.d.ts" />
// The user guide (docs/wiki), embedded in the server so agents can read how Aura works.

import ApprovalsandSafety from "../../../../../../docs/wiki/Approvals-and-Safety.md" with {
  type: "text",
};
import Apps from "../../../../../../docs/wiki/Apps.md" with { type: "text" };
import Customization from "../../../../../../docs/wiki/Customization.md" with { type: "text" };
import Engines from "../../../../../../docs/wiki/Engines.md" with { type: "text" };
import GettingStarted from "../../../../../../docs/wiki/Getting-Started.md" with { type: "text" };
import TheScreen from "../../../../../../docs/wiki/The-Screen.md" with { type: "text" };
import Troubleshooting from "../../../../../../docs/wiki/Troubleshooting.md" with { type: "text" };
import YourData from "../../../../../../docs/wiki/Your-Data.md" with { type: "text" };

export interface HelpPage {
  id: string;
  title: string;
  summary: string;
  text: string;
}

/** Wiki links (`[Engines](Engines)`) become plain text with the topic id to read next. */
function plain(text: string): string {
  return text.replace(
    /\[([^\]]+)\]\(([A-Z][A-Za-z-]+)\)/g,
    (_, label: string, page: string) => `${label} (topic "${page.toLowerCase()}")`,
  );
}

export const HELP_PAGES: HelpPage[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    summary: "Install, connect an AI, make the first app",
    text: GettingStarted,
  },
  {
    id: "the-screen",
    title: "The screen",
    summary: "The sidebar, the Helper's chat, an app with its chat, Settings (AI and History)",
    text: TheScreen,
  },
  {
    id: "apps",
    title: "Apps",
    summary:
      "Make an app, change it with approval, versions, data, files, secrets, actions, uninstall and bring back, libraries",
    text: Apps,
  },
  {
    id: "engines",
    title: "The AI",
    summary:
      "The built-in local AI, Ollama, LM Studio, Claude Code; which AI the Helper and @builder use",
    text: Engines,
  },
  {
    id: "approvals-and-safety",
    title: "Approvals and Safety",
    summary: "What asks the user first, what helpers may do, the sandbox",
    text: ApprovalsandSafety,
  },
  {
    id: "customization",
    title: "The look and the language",
    summary: "The theme file and its variables, the language, safe mode",
    text: Customization,
  },
  {
    id: "your-data",
    title: "Your data",
    summary: "Where everything is kept, backups, what leaves the computer",
    text: YourData,
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    summary: "A helper does not answer, Claude Code, local models, budgets, safe mode",
    text: Troubleshooting,
  },
].map((p) => ({ ...p, text: plain(p.text) }));

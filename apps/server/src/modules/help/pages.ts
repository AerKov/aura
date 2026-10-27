/// <reference path="../../providers/vendor-files.d.ts" />
// The user guide (docs/wiki), embedded in the server so agents can read how Aura works.

import AlertsandSchedules from "../../../../../docs/wiki/Alerts-and-Schedules.md" with {
  type: "text",
};
import ApprovalsandSafety from "../../../../../docs/wiki/Approvals-and-Safety.md" with {
  type: "text",
};
import Catalog from "../../../../../docs/wiki/Catalog.md" with { type: "text" };
import ChatsandAgents from "../../../../../docs/wiki/Chats-and-Agents.md" with { type: "text" };
import Customization from "../../../../../docs/wiki/Customization.md" with { type: "text" };
import Engines from "../../../../../docs/wiki/Engines.md" with { type: "text" };
import GettingStarted from "../../../../../docs/wiki/Getting-Started.md" with { type: "text" };
import Integrations from "../../../../../docs/wiki/Integrations.md" with { type: "text" };
import Memory from "../../../../../docs/wiki/Memory.md" with { type: "text" };
import Phone from "../../../../../docs/wiki/Phone.md" with { type: "text" };
import Skills from "../../../../../docs/wiki/Skills.md" with { type: "text" };
import Troubleshooting from "../../../../../docs/wiki/Troubleshooting.md" with { type: "text" };
import YourData from "../../../../../docs/wiki/Your-Data.md" with { type: "text" };

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
    summary: "Install, pick an engine, first project",
    text: GettingStarted,
  },
  {
    id: "engines",
    title: "Engines",
    summary:
      "What runs agents: Claude Code, Gemini CLI, Codex, OpenCode, OpenRouter, Ollama; logins and models",
    text: Engines,
  },
  {
    id: "chats-and-agents",
    title: "Chats and Agents",
    summary: "Chats, agents, who answers when, projects, run cards, budgets",
    text: ChatsandAgents,
  },
  {
    id: "integrations",
    title: "Integrations",
    summary: "MCP servers, secrets, variables for agents' commands, host checks",
    text: Integrations,
  },
  {
    id: "approvals-and-safety",
    title: "Approvals and Safety",
    summary: "What needs approval, command sandbox, project containers",
    text: ApprovalsandSafety,
  },
  { id: "skills", title: "Skills", summary: "Reusable know-how attached to agents", text: Skills },
  { id: "memory", title: "Memory", summary: "Agents' notes and long-chat summaries", text: Memory },
  {
    id: "catalog",
    title: "Catalog",
    summary: "Ready-made packs of agents, skills, themes, panels",
    text: Catalog,
  },
  {
    id: "alerts-and-schedules",
    title: "Alerts and Schedules",
    summary: "Monitoring webhooks and recurring jobs",
    text: AlertsandSchedules,
  },
  {
    id: "customization",
    title: "Customization",
    summary: "Themes, CSS, MCP servers and panel extensions",
    text: Customization,
  },
  { id: "phone", title: "Phone", summary: "Using Aura from a phone", text: Phone },
  {
    id: "your-data",
    title: "Your Data",
    summary: "Where everything lives, backups, git history",
    text: YourData,
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    summary: "Common problems and fixes",
    text: Troubleshooting,
  },
].map((p) => ({ ...p, text: plain(p.text) }));

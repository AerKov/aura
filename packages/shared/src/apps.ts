/**
 * The launcher's catalogue (ADR 0033): every app has a name, a one-line description and a group.
 * Built-in apps are listed here; installed and built apps say theirs in their manifest.
 */
import type { AppRef } from "./layout";
import type { ModuleId } from "./modules";

/** Groups of the built-in apps, in launcher order after the user's own groups. */
export const BUILTIN_GROUPS = ["Communication", "Agents", "System"] as const;

/** The group of an app whose manifest names none. */
export const DEFAULT_APP_GROUP = "Apps";

export const MAX_APP_DESCRIPTION = 200;
export const MAX_APP_GROUP = 30;

export interface BuiltinApp {
  /** Unique key; several entries may open the same app (Signals live in the messenger). */
  key: string;
  app: AppRef;
  name: string;
  description: string;
  group: (typeof BUILTIN_GROUPS)[number];
  /** The module that turns it on and off; null for the core's own apps. */
  module: ModuleId | null;
}

export const BUILTIN_APPS: BuiltinApp[] = [
  {
    key: "chats",
    app: "messenger",
    name: "Chats",
    description: "The messenger with the orchestrator, your agents and every app's chat.",
    group: "Communication",
    module: "chats",
  },
  {
    key: "signals",
    app: "messenger",
    name: "Signals",
    description: "Alerts from monitoring tools and apps, triaged by the orchestrator.",
    group: "Communication",
    module: "alerts",
  },
  {
    key: "agents",
    app: "page:agents",
    name: "Agents",
    description: "Each agent's prompt, engine, tools, memory and tool servers.",
    group: "Agents",
    module: "chats",
  },
  {
    key: "skills",
    app: "page:skills",
    name: "Skills",
    description: "Know-how your agents can use, with versions.",
    group: "Agents",
    module: "skills",
  },
  {
    key: "memory",
    app: "page:memory",
    name: "Memory",
    description: "What your agents remember, to search and delete.",
    group: "Agents",
    module: "memory",
  },
  {
    key: "schedule",
    app: "page:jobs",
    name: "Schedule",
    description: "Agents' work on a schedule.",
    group: "Agents",
    module: "jobs",
  },
  {
    key: "engines",
    app: "page:engines",
    name: "Engines",
    description: "Which AI runs your agents, and the command sandbox.",
    group: "System",
    module: "chats",
  },
  {
    key: "catalog",
    app: "page:catalog",
    name: "Catalog",
    description: "Packs of apps, agents, skills and themes to install.",
    group: "System",
    module: null,
  },
  {
    key: "customize",
    app: "page:customize",
    name: "Customize",
    description: "Theme, window manager, bar and extensions.",
    group: "System",
    module: null,
  },
  {
    key: "localization",
    app: "page:localization",
    name: "Localization",
    description: "The language of Aura, its agents and your apps.",
    group: "System",
    module: null,
  },
  {
    key: "backups",
    app: "page:backups",
    name: "Restore points",
    description: "Take Aura back or forward: apps, their data and settings. Removed apps' backups.",
    group: "System",
    module: null,
  },
  {
    key: "devices",
    app: "page:devices",
    name: "Devices",
    description: "Phones paired with this computer.",
    group: "System",
    module: null,
  },
];

/**
 * Groups for the launcher: the user's own groups first (alphabetical, the default group last of
 * them), then the built-in ones. Empty groups are left out. The names may be translated.
 */
export function groupOrder(
  groups: Iterable<string>,
  builtinGroups: readonly string[] = BUILTIN_GROUPS,
  defaultGroup: string = DEFAULT_APP_GROUP,
): string[] {
  const present = new Set(groups);
  const builtin = new Set(builtinGroups);
  const own = [...present].filter((g) => !builtin.has(g));
  own.sort((a, b) => (a === defaultGroup ? 1 : b === defaultGroup ? -1 : a.localeCompare(b)));
  return [...own, ...builtinGroups.filter((g) => present.has(g))];
}

/** Whether an app matches a launcher search: by name, description or group, ignoring case. */
export function matchesSearch(
  app: { name: string; description: string | null; group: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [app.name, app.description ?? "", app.group ?? ""].some((t) =>
    t.toLowerCase().includes(q),
  );
}

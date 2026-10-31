/**
 * The launcher's catalogue (ADR 0033, ADR 0034): every app has a name, a one-line description and
 * a group. Built-in apps are listed here; installed and built apps say theirs in their manifest.
 */
import type { AppRef } from "./layout";

/** Groups of the built-in apps, in launcher order after the user's own groups. */
export const BUILTIN_GROUPS = ["Essentials", "Settings"] as const;

/** The group of an app whose manifest names none. */
export const DEFAULT_APP_GROUP = "Apps";

export const MAX_APP_DESCRIPTION = 200;
export const MAX_APP_GROUP = 30;

export interface BuiltinApp {
  /** Unique key; several entries may open the same app (Alerts live in the messenger). */
  key: string;
  app: AppRef;
  /** Plain names for everyone (ADR 0034); the interface translates them. */
  name: string;
  description: string;
  group: (typeof BUILTIN_GROUPS)[number];
}

export const BUILTIN_APPS: BuiltinApp[] = [
  {
    key: "chats",
    app: "messenger",
    name: "Chats",
    description: "Write to your Helper, like in a messenger",
    group: "Essentials",
  },
  {
    key: "signals",
    app: "messenger",
    name: "Alerts",
    description: "When something broke or needs attention",
    group: "Essentials",
  },
  {
    key: "settings",
    app: "page:settings",
    name: "Settings",
    description: "AI, helpers, automations, history",
    group: "Settings",
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

/**
 * Built-in apps an app of the user's can take the place of (ADR 0041), like a GNU utility a user
 * replaces with their own: its manifest says `"replaces": "chats"` and it opens wherever Chats
 * would. The built-in one comes back when the app is off, removed or in safe mode.
 */
export const REPLACEABLE_APPS = ["chats", "signals", "settings"] as const;
export type ReplaceableApp = (typeof REPLACEABLE_APPS)[number];

export function isReplaceableApp(value: unknown): value is ReplaceableApp {
  return typeof value === "string" && (REPLACEABLE_APPS as readonly string[]).includes(value);
}

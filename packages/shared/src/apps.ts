/**
 * Apps on the user's screen (ADR 0042): the Helper's chat, the user's apps, and Settings. Apps say
 * their name, description and icon in their manifest.
 */

export const MAX_APP_DESCRIPTION = 200;
export const MAX_APP_GROUP = 30;

/** The tabs of Settings (ADR 0042): the AI, and History (uninstalled apps). */
export const SETTINGS_TABS = ["ai", "history"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && (SETTINGS_TABS as readonly string[]).includes(value);
}

/** Whether an app matches a search: by name or description, ignoring case. */
export function matchesSearch(app: { name: string; description: string | null }, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [app.name, app.description ?? ""].some((t) => t.toLowerCase().includes(q));
}

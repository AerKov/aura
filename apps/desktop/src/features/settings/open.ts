import type { SettingsTab } from "@aura/shared";
import { setState } from "@/features/chat/store";
import { openEntry } from "@/features/shell/apps";

/** Opens Settings at a tab (ADR 0039), or the user's app that replaces Settings (ADR 0041). */
export function openSettings(tab: SettingsTab, where: "here" | "right" = "here"): void {
  setState(() => ({ settingsTab: tab }));
  openEntry("settings", "page:settings", where);
}

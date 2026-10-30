import type { SettingsTab } from "@aura/shared";
import { setState } from "@/features/chat/store";
import { openAppRef } from "@/features/shell/layout";

/** Opens Settings at a tab (ADR 0039): beside the current tile, or in it. */
export function openSettings(tab: SettingsTab, where: "here" | "right" = "here"): void {
  setState(() => ({ settingsTab: tab }));
  openAppRef("page:settings", where);
}

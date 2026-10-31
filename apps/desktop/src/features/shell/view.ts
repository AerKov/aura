import { type ExtensionInfo, isSettingsTab, type SettingsTab } from "@aura/shared";
import { useMemo } from "react";
import { getState, setState, useChatStore, type View } from "@/features/chat/store";

const KEY = "aura.view";

/** The last screen, so Aura opens where the user left it (a per-viewer convenience). */
export function restoreView(): void {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return;
    const v = raw as { kind?: unknown; id?: unknown; tab?: unknown };
    if (v.kind === "app" && typeof v.id === "string") show({ kind: "app", id: v.id }, false);
    else if (v.kind === "settings" && isSettingsTab(v.tab))
      show({ kind: "settings", tab: v.tab }, false);
  } catch {
    // No storage (a private window): start with the Helper.
  }
}

function show(view: View, save = true): void {
  setState(() => ({ view }));
  if (!save) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    // Not saved: it only decides where Aura opens next time.
  }
}

export function openHelper(): void {
  show({ kind: "helper" });
}

export function openApp(id: string): void {
  show({ kind: "app", id });
}

export function openSettings(tab: SettingsTab = "ai"): void {
  show({ kind: "settings", tab });
}

/** Opens what an app or a card names: "settings", "settings:history", "ext:<id>" or "<id>". */
export function openKey(key: string): void {
  if (key === "chats" || key === "helper" || key === "messenger") openHelper();
  else if (key.startsWith("settings")) {
    const tab = key.split(":")[1];
    openSettings(isSettingsTab(tab) ? tab : "ai");
  } else openApp(key.startsWith("ext:") ? key.slice(4) : key);
}

/** After an app is uninstalled: if it was on screen, the Helper takes its place. */
export function leaveApp(id: string): void {
  const view = getState().view;
  if (view.kind === "app" && view.id === id) openHelper();
}

/** Enabled apps with a screen (not in safe mode), in name order. */
export function useApps(): ExtensionInfo[] {
  const customize = useChatStore((s) => s.customize);
  return useMemo(
    () =>
      customize?.safeMode.on
        ? []
        : (customize?.extensions ?? [])
            .filter((e) => e.permissions.includes("ui.panel") || e.app)
            .sort((a, b) => a.name.localeCompare(b.name)),
    [customize],
  );
}

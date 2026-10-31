import { type AppRef, BUILTIN_APPS, type ExtensionInfo, type PageId } from "@aura/shared";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bot,
  Clock,
  Cpu,
  History,
  Languages,
  LayoutGrid,
  MessageSquare,
  NotebookPen,
  Package,
  Settings,
  SlidersHorizontal,
  WandSparkles,
} from "lucide-react";
import { useMemo } from "react";
import { openChat } from "@/features/chat/actions";
import { getState, useChatStore } from "@/features/chat/store";
import { extensionIcon } from "@/lib/extension-icons";
import { openAppRef } from "./layout";

/** Icons of the built-in apps, by catalogue key (ADR 0034). */
export const BUILTIN_ICONS: Record<string, LucideIcon> = {
  chats: MessageSquare,
  signals: Bell,
  schedule: Clock,
  agents: Bot,
  skills: WandSparkles,
  memory: NotebookPen,
  customize: SlidersHorizontal,
  localization: Languages,
  backups: History,
  catalog: Package,
  engines: Cpu,
  settings: Settings,
};

/** Labels and icons of the built-in pages, from the shared catalogue. */
export const PAGES = Object.fromEntries(
  BUILTIN_APPS.filter((b) => b.app.startsWith("page:")).map((b) => [
    b.app.slice(5),
    { label: b.name, icon: BUILTIN_ICONS[b.key] ?? LayoutGrid },
  ]),
) as Record<PageId, { label: string; icon: LucideIcon }>;

/** Opens a launcher entry: Alerts open the messenger on the system chat. */
/** Enabled apps with a panel, from a store snapshot (no safe mode). */
function enabledApps(customize: ReturnType<typeof getState>["customize"]): ExtensionInfo[] {
  return customize?.safeMode.on
    ? []
    : (customize?.extensions ?? []).filter((e) => e.enabled && e.permissions.includes("ui.panel"));
}

/**
 * The user's app that takes the place of a built-in one (ADR 0041), like a GNU utility replaced by
 * the user's own: it opens wherever the built-in would. Off, removed or in safe mode, the built-in
 * one is back.
 */
export function replacementOf(key: string, apps: ExtensionInfo[]): ExtensionInfo | undefined {
  return apps.find((e) => e.replaces === key);
}

export function openEntry(key: string, app: AppRef, where: "here" | "right" = "here"): void {
  const replacement = replacementOf(key, enabledApps(getState().customize));
  if (replacement) {
    openAppRef(`ext:${replacement.id}`, where);
    return;
  }
  if (key === "signals") {
    const system = Object.values(getState().chats).find((c) => c.kind === "system");
    if (system) {
      openChat(system.id);
      return;
    }
  }
  openAppRef(app, where);
}

/** Enabled extensions with a panel: the apps users install or build. */
export function useExtensionApps(): ExtensionInfo[] {
  const customize = useChatStore((s) => s.customize);
  return useMemo(() => enabledApps(customize), [customize]);
}

export function appInfo(
  app: AppRef,
  extensions: ExtensionInfo[],
): { label: string; icon: LucideIcon } {
  if (app === "home") return { label: "New window", icon: LayoutGrid };
  if (app === "messenger") return { label: "Chats", icon: MessageSquare };
  if (app.startsWith("page:")) return PAGES[app.slice(5) as PageId];
  const ext = extensions.find((e) => e.id === app.slice(4));
  return { label: ext?.name ?? app.slice(4), icon: extensionIcon(ext?.icon ?? null) };
}

/** Rail keys ("home", "chats", "skills", "ext:<id>") as apps. */
export function railApp(key: string): AppRef {
  if (key === "home") return "home";
  if (key === "chats" || key === "signals") return "messenger";
  if (key.startsWith("ext:")) return key as AppRef;
  return `page:${key}` as AppRef;
}

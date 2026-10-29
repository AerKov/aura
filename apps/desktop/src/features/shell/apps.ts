import {
  type AppRef,
  defaultModules,
  type ExtensionInfo,
  type ModuleStates,
  moduleOfApp,
  type PageId,
} from "@aura/shared";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Brain,
  CalendarClock,
  Cpu,
  History,
  Languages,
  LayoutGrid,
  MessagesSquare,
  Package,
  Palette,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useMemo } from "react";
import { useChatStore } from "@/features/chat/store";
import { extensionIcon } from "@/lib/extension-icons";

export const PAGES: Record<PageId, { label: string; icon: LucideIcon }> = {
  skills: { label: "Skills", icon: Sparkles },
  memory: { label: "Memory", icon: Brain },
  agents: { label: "Agents", icon: Bot },
  catalog: { label: "Catalog", icon: Package },
  jobs: { label: "Schedule", icon: CalendarClock },
  engines: { label: "Engines", icon: Cpu },
  customize: { label: "Customize", icon: Palette },
  devices: { label: "Devices", icon: Smartphone },
  localization: { label: "Localization", icon: Languages },
  backups: { label: "Restore points", icon: History },
};

/** Enabled extensions with a panel: the apps users install or build. */
export function useExtensionApps(): ExtensionInfo[] {
  const customize = useChatStore((s) => s.customize);
  return useMemo(
    () =>
      customize?.safeMode.on
        ? []
        : (customize?.extensions ?? []).filter(
            (e) => e.enabled && e.permissions.includes("ui.panel"),
          ),
    [customize],
  );
}

export function appInfo(
  app: AppRef,
  extensions: ExtensionInfo[],
): { label: string; icon: LucideIcon } {
  if (app === "home") return { label: "Home", icon: LayoutGrid };
  if (app === "messenger") return { label: "Chats", icon: MessagesSquare };
  if (app.startsWith("page:")) return PAGES[app.slice(5) as PageId];
  const ext = extensions.find((e) => e.id === app.slice(4));
  return { label: ext?.name ?? app.slice(4), icon: extensionIcon(ext?.icon ?? null) };
}

/** Rail keys ("home", "chats", "skills", "ext:<id>") as apps. */
export function railApp(key: string): AppRef {
  if (key === "home") return "home";
  if (key === "chats") return "messenger";
  if (key.startsWith("ext:")) return key as AppRef;
  return `page:${key}` as AppRef;
}

/** Built-in apps that are on (ADR 0027); all on until the server says otherwise. */
export function useModules(): ModuleStates {
  const modules = useChatStore((s) => s.customize?.modules);
  return useMemo(() => modules ?? defaultModules(), [modules]);
}

/** Whether an app can open now: its module is on (the core's own apps always can). */
export function appAvailable(app: AppRef, modules: ModuleStates): boolean {
  const module = moduleOfApp(app);
  return module === null || modules[module];
}

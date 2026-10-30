import {
  type AppRef,
  BUILTIN_APPS,
  BUILTIN_GROUPS,
  type BuiltinApp,
  DEFAULT_APP_GROUP,
  type ExtensionInfo,
  groupOrder,
  matchesSearch,
  visibleApps,
} from "@aura/shared";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { useMemo } from "react";
import { setState, useChatStore } from "@/features/chat/store";
import { useT } from "@/features/localization/i18n";
import { extensionIcon } from "@/lib/extension-icons";
import { BUILTIN_ICONS, useExtensionApps } from "./apps";

/** One app in the launcher: one the user made or installed, or a built-in one (ADR 0034). */
export interface Entry {
  key: string;
  app: AppRef;
  name: string;
  description: string | null;
  group: string;
  icon: LucideIcon;
  builtin: BuiltinApp | null;
  extension: ExtensionInfo | null;
  /** Shown in a tile now. */
  open: boolean;
}

export function closeMenus(): void {
  setState(() => ({ menuOpen: false, addOpen: false }));
}

/**
 * The launcher's groups: the user's own first, then Essentials and Settings, each entry with its
 * translated name and description. `query` filters
 * by name, description or group.
 */
export function useLauncher(query = ""): { group: string; entries: Entry[] }[] {
  const extensions = useExtensionApps();
  const layout = useChatStore((s) => s.layout);
  const t = useT();
  return useMemo(() => {
    const visible = new Set(visibleApps(layout));
    const all: Entry[] = [
      ...extensions.map((ext) => ({
        key: `ext:${ext.id}`,
        app: `ext:${ext.id}` as AppRef,
        name: ext.name,
        description: ext.description,
        group: ext.group ?? t(DEFAULT_APP_GROUP),
        icon: extensionIcon(ext.icon),
        builtin: null,
        extension: ext,
        open: visible.has(`ext:${ext.id}`),
      })),
      ...BUILTIN_APPS.map((b) => ({
        key: b.key,
        app: b.app,
        name: t(b.name),
        description: t(b.description),
        group: t(b.group),
        icon: BUILTIN_ICONS[b.key] ?? LayoutGrid,
        builtin: b,
        extension: null,
        open: visible.has(b.app) && b.key !== "signals",
      })),
    ];
    const shown = all.filter((e) => matchesSearch(e, query));
    return groupOrder(
      shown.map((e) => e.group),
      BUILTIN_GROUPS.map((g) => t(g)),
      t(DEFAULT_APP_GROUP),
    ).map((group) => ({ group, entries: shown.filter((e) => e.group === group) }));
  }, [extensions, layout, query, t]);
}

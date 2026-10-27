import type { ExtensionInfo, Project } from "@aura/shared";
import { Pin, PinOff, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { getState, setState, useChatStore } from "@/features/chat/store";
import { api, call } from "@/lib/api";
import { extensionIcon } from "@/lib/extension-icons";
import { ExtensionFrame } from "./extension-frame";

/** Enabled extensions that have a panel: what the side panel can open. */
export function useApps(): ExtensionInfo[] {
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

/** The app open next to a chat: the user's choice, else the project's pinned app. */
export function useOpenApp(chatId: string, project: Project | undefined): ExtensionInfo | null {
  const apps = useApps();
  const chosen = useChatStore((s) => s.sideApp[chatId]);
  const id = chosen === undefined ? (project?.app ?? null) : chosen;
  return apps.find((a) => a.id === id) ?? null;
}

export function openApp(chatId: string, extensionId: string | null): void {
  setState((s) => ({ sideApp: { ...s.sideApp, [chatId]: extensionId } }));
}

/** Opens the panel with the project's app, the last app used, or the first one. */
export function toggleApps(chatId: string, project: Project | undefined, apps: ExtensionInfo[]) {
  const s = getState();
  const current = s.sideApp[chatId] === undefined ? (project?.app ?? null) : s.sideApp[chatId];
  if (current && apps.some((a) => a.id === current)) return openApp(chatId, null);
  const last = Object.values(s.sideApp).find((id) => id && apps.some((a) => a.id === id));
  openApp(chatId, project?.app ?? last ?? apps[0]?.id ?? null);
}

/**
 * The side panel to the right of a chat (ADR 0021): extensions open here next to the
 * conversation, with the chat and project as their context. A project's app opens by itself.
 */
export function SidePanel({
  chatId,
  project,
  app,
}: {
  chatId: string;
  project: Project | undefined;
  app: ExtensionInfo;
}) {
  const apps = useApps();
  const pinned = project?.app === app.id;
  const Icon = extensionIcon(app.icon);

  const pin = async () => {
    if (!project) return;
    try {
      const updated = await call(() =>
        api.projects({ projectId: project.id }).app.put({ extensionId: pinned ? null : app.id }),
      );
      setState((s) => ({ projects: { ...s.projects, [project.id]: updated as Project } }));
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <aside className="bg-background flex w-[400px] shrink-0 flex-col border-l max-lg:w-[340px] max-md:fixed max-md:inset-0 max-md:z-30 max-md:w-auto">
      <header className="flex h-14 items-center gap-2 border-b px-3">
        <Icon className="text-primary size-4 shrink-0" />
        <select
          aria-label="App"
          className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold outline-none"
          value={app.id}
          onChange={(event) => openApp(chatId, event.target.value)}
        >
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {project && (
          <Button
            size="icon"
            variant={pinned ? "secondary" : "ghost"}
            title={
              pinned
                ? "Unpin from this project"
                : "Pin to this project: it opens by itself in the project chat"
            }
            aria-label={pinned ? "Unpin from project" : "Pin to project"}
            onClick={() => void pin()}
          >
            {pinned ? <PinOff /> : <Pin />}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          aria-label="Close the panel"
          onClick={() => openApp(chatId, null)}
        >
          <X />
        </Button>
      </header>
      <ExtensionFrame
        key={app.id}
        extension={app}
        variant="side"
        context={{ chatId, projectId: project?.id ?? null }}
      />
    </aside>
  );
}

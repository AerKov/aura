import { useEffect } from "react";
import { AuraLogo } from "@/components/logo";
import { ChatView } from "@/features/chat/chat-view";
import { useChatStore } from "@/features/chat/store";
import { FilePicker } from "@/features/files/picker";
import { FileViewer } from "@/features/files/viewer";
import { useT } from "@/features/localization/i18n";
import { SettingsView } from "@/features/settings/settings-view";
import { AppScreen } from "./app-screen";
import { Nav } from "./nav";
import { NewAppDialog } from "./new-app-dialog";
import { openHelper, useApps } from "./view";

/**
 * The shell (ADR 0042): the sidebar, and beside it one thing at a time: the Helper's chat, an app
 * with its chat, or Settings. Behind everything a slow aurora glows.
 */
export function Shell() {
  const view = useChatStore((s) => s.view);
  const customize = useChatStore((s) => s.customize);
  const apps = useApps();
  // An app that is gone (uninstalled elsewhere) leaves the Helper on screen.
  useEffect(() => {
    if (view.kind === "app" && customize && !apps.some((a) => a.id === view.id)) openHelper();
  }, [view, apps, customize]);

  const key = view.kind === "app" ? `app:${view.id}` : view.kind;
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <Nav />
      <main key={key} className="relative flex min-h-0 min-w-0 flex-1 p-2">
        {view.kind === "helper" && <HelperScreen />}
        {view.kind === "app" && <AppScreen id={view.id} />}
        {view.kind === "settings" && (
          <div className="glass-strong animate-in fade-in slide-in-from-bottom-2 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[calc(var(--radius)*1.25)] duration-500">
            <SettingsView tab={view.tab} />
          </div>
        )}
      </main>
      <NewAppDialog />
      <FileViewer />
      <FilePicker />
    </div>
  );
}

/** The Helper's chat: where the user says what to build. */
function HelperScreen() {
  const t = useT();
  const chatId = useChatStore(
    (s) => Object.values(s.chats).find((c) => c.kind === "direct")?.id ?? null,
  );
  if (!chatId)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <AuraLogo className="size-12 animate-pulse" />
        <p className="text-muted-foreground text-sm">{t("Waking up…")}</p>
      </div>
    );
  return (
    <div className="animate-in fade-in flex min-h-0 min-w-0 flex-1 duration-500">
      <ChatView key={chatId} chatId={chatId} />
    </div>
  );
}

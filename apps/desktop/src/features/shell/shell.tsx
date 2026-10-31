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
 * with its chat, or Settings, over the faint contours of an aura.
 */
export function Shell() {
  const view = useChatStore((s) => s.view);
  const customize = useChatStore((s) => s.customize);
  const apps = useApps();
  // An app that is gone (uninstalled elsewhere) leaves the Helper on screen.
  useEffect(() => {
    if (view.kind === "app" && customize && !apps.some((a) => a.id === view.id)) openHelper();
  }, [view, apps, customize]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <Nav />
      <main className="relative flex min-h-0 min-w-0 flex-1 p-2">
        {view.kind === "helper" && <HelperScreen />}
        {view.kind === "app" && <AppScreen id={view.id} />}
        {view.kind === "settings" && (
          <div className="bg-card view-in flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[calc(var(--radius)*1.25)] border shadow-md">
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
        <AuraLogo alive className="size-14" />
        <p className="text-muted-foreground text-sm">{t("Waking up…")}</p>
      </div>
    );
  return (
    <div className="view-in flex min-h-0 min-w-0 flex-1">
      <ChatView key={chatId} chatId={chatId} />
    </div>
  );
}

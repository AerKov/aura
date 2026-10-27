import { useEffect, useState } from "react";
import { AuraLogo } from "@/components/logo";
import { CatalogView } from "@/features/catalog/catalog-view";
import {
  loadInitial,
  loadMessages,
  loadProviderStatus,
  reportError,
} from "@/features/chat/actions";
import { ChatView } from "@/features/chat/chat-view";
import { startRealtime } from "@/features/chat/realtime";
import { Sidebar } from "@/features/chat/sidebar";
import { useChatStore } from "@/features/chat/store";
import { loadAppearance } from "@/features/customize/appearance";
import { CustomizeView, loadCustomize } from "@/features/customize/customize-view";
import { ExtensionFrame } from "@/features/customize/extension-frame";
import { DevicesView } from "@/features/devices/devices-view";
import { PairingScreen } from "@/features/devices/pairing-screen";
import { EnginesView } from "@/features/engines/engines-view";
import { JobsView } from "@/features/jobs/jobs-view";
import { MemoryView } from "@/features/memory/memory-view";
import { Rail } from "@/features/shell/rail";
import { SkillsView } from "@/features/skills/skills-view";
import { SERVER_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

export function App() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const view = useChatStore((s) => s.view);
  const pane = useChatStore((s) => s.pane);
  const needsPairing = useChatStore((s) => s.needsPairing);
  const extension = useChatStore((s) =>
    s.view.startsWith("ext:")
      ? s.customize?.extensions.find((e) => e.id === s.view.slice(4) && e.enabled)
      : undefined,
  );
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    loadProviderStatus().catch(reportError);
    loadAppearance().catch(reportError);
    loadCustomize().catch(reportError);
    loadInitial().catch((error: unknown) => {
      reportError(error);
      setStartError(error instanceof Error ? error.message : String(error));
    });
    return startRealtime();
  }, []);

  useEffect(() => {
    if (activeChatId) void loadMessages(activeChatId).catch(reportError);
  }, [activeChatId]);

  if (needsPairing) return <PairingScreen />;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Rail />
      <Sidebar />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          view === "chat" && pane === "list" && "max-md:hidden",
          view !== "chat" && "max-md:pb-16",
        )}
      >
        <div className="flex min-h-0 flex-1">
          {view === "skills" ? (
            <SkillsView />
          ) : view === "memory" ? (
            <MemoryView />
          ) : view === "catalog" ? (
            <CatalogView />
          ) : view === "jobs" ? (
            <JobsView />
          ) : view === "engines" ? (
            <EnginesView />
          ) : view === "customize" ? (
            <CustomizeView />
          ) : view === "devices" ? (
            <DevicesView />
          ) : extension ? (
            <ExtensionFrame key={extension.id} extension={extension} />
          ) : activeChatId ? (
            <ChatView key={activeChatId} chatId={activeChatId} />
          ) : (
            <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <AuraLogo className="size-12 animate-pulse" />
              <p className="text-muted-foreground max-w-sm text-sm">
                {startError
                  ? `Cannot reach the Aura server at ${SERVER_URL}: ${startError}`
                  : "Waking up…"}
              </p>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}

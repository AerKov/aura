import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import {
  loadInitial,
  loadMessages,
  loadProviderStatus,
  reportError,
  showList,
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
import { JobsView } from "@/features/jobs/jobs-view";
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
      <Sidebar />
      <div className={cn("flex min-w-0 flex-1 flex-col", pane === "list" && "max-md:hidden")}>
        {view !== "chat" && (
          <button
            type="button"
            onClick={showList}
            className="text-muted-foreground flex items-center gap-1 border-b px-3 py-2 text-sm md:hidden"
          >
            <ChevronLeft className="size-4" /> Back
          </button>
        )}
        <div className="flex min-h-0 flex-1">
          {view === "skills" ? (
            <SkillsView />
          ) : view === "jobs" ? (
            <JobsView />
          ) : view === "customize" ? (
            <CustomizeView />
          ) : view === "devices" ? (
            <DevicesView />
          ) : extension ? (
            <ExtensionFrame key={extension.id} extension={extension} />
          ) : activeChatId ? (
            <ChatView key={activeChatId} chatId={activeChatId} />
          ) : (
            <main className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
              {startError
                ? `Cannot reach the local server at ${SERVER_URL}: ${startError}`
                : "Loading…"}
            </main>
          )}
        </div>
      </div>
    </div>
  );
}

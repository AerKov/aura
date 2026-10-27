import { useEffect, useState } from "react";
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
import { JobsView } from "@/features/jobs/jobs-view";
import { SkillsView } from "@/features/skills/skills-view";
import { SERVER_URL } from "@/lib/api";

export function App() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const view = useChatStore((s) => s.view);
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {view === "skills" ? (
        <SkillsView />
      ) : view === "jobs" ? (
        <JobsView />
      ) : view === "customize" ? (
        <CustomizeView />
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
  );
}

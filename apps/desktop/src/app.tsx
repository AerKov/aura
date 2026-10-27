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
import { SkillsView } from "@/features/skills/skills-view";
import { SERVER_URL } from "@/lib/api";

export function App() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const view = useChatStore((s) => s.view);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    loadProviderStatus().catch(reportError);
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

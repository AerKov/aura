import { useCallback, useEffect, useState } from "react";
import { AuraLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  loadInitial,
  loadMessages,
  loadProviderStatus,
  reportError,
} from "@/features/chat/actions";
import { startRealtime } from "@/features/chat/realtime";
import { useChatStore } from "@/features/chat/store";
import { loadAppearance } from "@/features/customize/appearance";
import { loadCustomize } from "@/features/customize/customize-view";
import { PairingScreen } from "@/features/devices/pairing-screen";
import { loadLayout } from "@/features/shell/layout";
import { Rail } from "@/features/shell/rail";
import { Shell } from "@/features/shell/shell";
import { SERVER_URL } from "@/lib/api";
import { type ServerStatus, ServerUnreachableError } from "@/lib/server-wait";

interface StartError {
  message: string;
  server: ServerStatus | null;
}

export function App() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const needsPairing = useChatStore((s) => s.needsPairing);
  const [startError, setStartError] = useState<StartError | null>(null);

  const load = useCallback(() => {
    setStartError(null);
    loadAppearance().catch(reportError);
    loadLayout().catch(reportError);
    // Which built-in apps are on decides what else loads (ADR 0027).
    loadCustomize()
      .then((state) => {
        if (state.modules.chats) loadProviderStatus().catch(reportError);
        return loadInitial();
      })
      .catch((error: unknown) => {
        reportError(error);
        setStartError({
          message: error instanceof Error ? error.message : String(error),
          server: error instanceof ServerUnreachableError ? error.status : null,
        });
      });
  }, []);

  useEffect(() => {
    load();
    return startRealtime();
  }, [load]);

  useEffect(() => {
    if (activeChatId) void loadMessages(activeChatId).catch(reportError);
  }, [activeChatId]);

  if (needsPairing) return <PairingScreen />;

  // The shell (ADR 0024): the rail, and the user's apps as tiles.
  return (
    <div className="flex h-dvh overflow-hidden">
      <Rail />
      {startError ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <AuraLogo className="size-12" />
          <p className="text-muted-foreground max-w-sm text-sm">
            Cannot reach the Aura server at {SERVER_URL}: {startError.message}
          </p>
          {startError.server && startError.server.lines.length > 0 && (
            <pre className="bg-muted text-muted-foreground max-h-64 w-full max-w-2xl overflow-auto rounded-md p-3 text-left text-xs whitespace-pre-wrap">
              {startError.server.lines.join("\n")}
            </pre>
          )}
          <Button variant="outline" onClick={load}>
            Try again
          </Button>
        </main>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 max-md:pb-16">
          <Shell />
        </div>
      )}
    </div>
  );
}

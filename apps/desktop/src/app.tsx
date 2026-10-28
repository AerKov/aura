import { useEffect, useState } from "react";
import { AuraLogo } from "@/components/logo";
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

export function App() {
  const activeChatId = useChatStore((s) => s.activeChatId);
  const needsPairing = useChatStore((s) => s.needsPairing);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    loadProviderStatus().catch(reportError);
    loadAppearance().catch(reportError);
    loadCustomize().catch(reportError);
    loadLayout().catch(reportError);
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

  // The shell (ADR 0024): the rail, and the user's apps as tiles.
  return (
    <div className="flex h-dvh overflow-hidden">
      <Rail />
      {startError ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <AuraLogo className="size-12" />
          <p className="text-muted-foreground max-w-sm text-sm">
            Cannot reach the Aura server at {SERVER_URL}: {startError}
          </p>
        </main>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 max-md:pb-16">
          <Shell />
        </div>
      )}
    </div>
  );
}

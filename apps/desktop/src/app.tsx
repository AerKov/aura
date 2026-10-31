import { useCallback, useEffect, useState } from "react";
import { AuraLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { loadInitial, loadProviderStatus, reportError } from "@/features/chat/actions";
import { startRealtime } from "@/features/chat/realtime";
import { loadAppearance } from "@/features/customize/appearance";
import { loadCustomize } from "@/features/customize/state";
import { tr, useLocaleKey } from "@/features/localization/i18n";
import { Shell } from "@/features/shell/shell";
import { restoreView } from "@/features/shell/view";
import { SERVER_URL } from "@/lib/api";
import { type ServerStatus, ServerUnreachableError } from "@/lib/server-wait";

interface StartError {
  message: string;
  server: ServerStatus | null;
}

export function App() {
  const [startError, setStartError] = useState<StartError | null>(null);
  // A new language draws everything again, so every text follows (ADR 0033).
  const localeKey = useLocaleKey();

  const load = useCallback(() => {
    setStartError(null);
    loadAppearance().catch(reportError);
    restoreView();
    loadCustomize()
      .then(() => {
        loadProviderStatus().catch(reportError);
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

  // The shell (ADR 0042) over the faint contours of an aura.
  return (
    <div key={localeKey} className="aura-backdrop relative flex h-dvh overflow-hidden">
      {startError ? (
        <main className="relative flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <AuraLogo alive className="size-14" />
          <p className="text-muted-foreground max-w-sm text-sm">
            {tr("Cannot reach the Aura server at")} {SERVER_URL}: {startError.message}
          </p>
          {startError.server && startError.server.lines.length > 0 && (
            <pre className="bg-muted text-muted-foreground max-h-64 w-full max-w-2xl overflow-auto rounded-md p-3 text-left text-xs whitespace-pre-wrap">
              {startError.server.lines.join("\n")}
            </pre>
          )}
          <Button variant="outline" onClick={load}>
            {tr("Try again")}
          </Button>
        </main>
      ) : (
        <Shell />
      )}
    </div>
  );
}

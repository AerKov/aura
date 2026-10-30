import { Cpu, HardDrive, RefreshCw, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/features/localization/i18n";
import { recheckProvider, reportError, showEngines } from "./actions";
import { useChatStore } from "./store";

/**
 * Shown when the default engine is not ready. It leads with the built-in local AI (ADR 0038); your
 * own agent apps (Claude Code and the others) are one step further. For Claude Code the app never
 * handles the login itself (CLAUDE.md rule 4): it only explains how.
 */
export function SetupPanel() {
  const t = useT();
  const provider = useChatStore((s) => s.provider);
  const [checking, setChecking] = useState(false);
  if (!provider || provider.ok) return null;

  const check = async () => {
    setChecking(true);
    try {
      await recheckProvider();
    } catch (error) {
      reportError(error);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bg-card mx-auto mb-3 max-w-xl border border-warning/65 p-4 text-sm">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <Cpu className="size-4" /> {t("Connect an AI to start")}
      </div>
      <p className="text-muted-foreground mb-3">
        {t(
          "Your helpers need an AI to think with. The easiest way is the built-in local AI: Aura installs it and a model that fits this computer.",
        )}
      </p>
      <Button size="sm" onClick={showEngines}>
        <HardDrive /> {t("Set up the local AI")}
      </Button>
      <details className="mt-4 border-t pt-3">
        <summary className="text-muted-foreground cursor-pointer text-[13px]">
          {t("I already use an agent app (Claude Code, Codex…) or Ollama")}
        </summary>
        <div className="mt-3 grid gap-3">
          <p className="text-muted-foreground">{provider.reason}</p>
          {provider.engine === "claude-code" && (
            <div>
              <div className="mb-1 flex items-center gap-2 font-medium">
                <TerminalSquare className="size-4" /> {t("Connect Claude Code")}
              </div>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  {t("Install Claude Code:")}{" "}
                  <code className="bg-muted px-1">npm install -g @anthropic-ai/claude-code</code>
                </li>
                <li>
                  {t("Run")} <code className="bg-muted px-1">claude</code>{" "}
                  {t("in a terminal and log in with your Claude account.")}
                </li>
                <li>{t("Come back and check again. The app never sees your credentials.")}</li>
              </ol>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={checking} onClick={() => void check()}>
              <RefreshCw className={checking ? "animate-spin" : ""} /> {t("Check again")}
            </Button>
            <Button size="sm" variant="ghost" onClick={showEngines}>
              <Cpu /> {t("Open Settings → AI")}
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}

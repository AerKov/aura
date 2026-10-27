import { Cpu, RefreshCw, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { recheckProvider, reportError, showEngines } from "./actions";
import { useChatStore } from "./store";

/**
 * Shown when the default engine is not ready. For Claude Code the app never handles the login
 * itself (CLAUDE.md rule 4): it only explains how to do it, and offers the other engines.
 */
export function SetupPanel() {
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

  const recheck = (
    <Button size="sm" variant="outline" disabled={checking} onClick={() => void check()}>
      <RefreshCw className={checking ? "animate-spin" : ""} /> Check again
    </Button>
  );
  const otherEngines = (
    <Button size="sm" variant="ghost" onClick={showEngines}>
      <Cpu /> Use another engine
    </Button>
  );

  if (provider.engine !== "claude-code") {
    return (
      <div className="mx-auto mb-3 max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <Cpu className="size-4" /> The agent engine is not ready
        </div>
        <p className="text-muted-foreground mb-3">{provider.reason}</p>
        <div className="flex flex-wrap gap-2">
          {recheck}
          <Button size="sm" variant="ghost" onClick={showEngines}>
            <Cpu /> Open Engines
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-3 max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <TerminalSquare className="size-4" /> Connect Claude Code
      </div>
      <p className="text-muted-foreground mb-3">{provider.reason}</p>
      <ol className="mb-3 list-decimal space-y-1 pl-5">
        <li>
          Install Claude Code:{" "}
          <code className="bg-muted rounded px-1">npm install -g @anthropic-ai/claude-code</code>
        </li>
        <li>
          Run <code className="bg-muted rounded px-1">claude</code> in a terminal and log in with
          your Claude account.
        </li>
        <li>Come back and check again. The app never sees your credentials.</li>
      </ol>
      <p className="text-muted-foreground mb-3">
        No Claude subscription? Run agents for free on local models (Ollama) or free OpenRouter
        models.
      </p>
      <div className="flex flex-wrap gap-2">
        {recheck}
        {otherEngines}
      </div>
    </div>
  );
}

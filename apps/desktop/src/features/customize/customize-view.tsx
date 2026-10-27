import type { CustomizeState } from "@aura/shared";
import { Blocks, Palette, Plug, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { setState, useChatStore } from "@/features/chat/store";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { setAppearance } from "./appearance";

const PERMISSION_TEXT: Record<string, string> = {
  "chat.read": "Read chats and messages",
  "chat.write": "Post messages",
  "ui.panel": "Show a panel",
  "alerts.read": "Read alerts",
};

/** Everything the user (or the orchestrator, with approval) customized: looks, tools, extensions. */
export function CustomizeView() {
  const appearance = useChatStore((s) => s.appearance);
  const state = useChatStore((s) => s.customize);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      reportError(err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <section className="min-w-0 flex-1 overflow-y-auto p-6">
      <h1 className="mb-1 text-xl font-semibold">Customize</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Ask the orchestrator to change the app (“make a dark blue theme”, “add a panel with today's
        alerts”). Every change is approved by you and committed to <code>~/.aura</code>.
      </p>
      {state?.safeMode.on && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <ShieldAlert className="size-4" /> Safe mode: MCP servers and extensions are off (
          {state.safeMode.reason}).
        </div>
      )}
      {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <Palette className="size-4" /> Appearance
      </h2>
      <div className="mb-8 rounded-xl border p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {[null, ...(appearance?.themes ?? [])].map((theme) => (
            <Button
              key={theme ?? "default"}
              size="sm"
              variant={appearance?.theme === theme ? "default" : "outline"}
              onClick={() => void run(() => setAppearance({ theme }))}
            >
              {theme ?? "Default"}
            </Button>
          ))}
        </div>
        {(appearance?.availableSnippets.length ?? 0) > 0 && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs uppercase">Snippets</p>
            {appearance?.availableSnippets.map((name) => {
              const on = appearance.snippets.includes(name);
              return (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      void run(() =>
                        setAppearance({
                          snippets: on
                            ? appearance.snippets.filter((s) => s !== name)
                            : [...appearance.snippets, name],
                        }),
                      )
                    }
                  />
                  {name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <Blocks className="size-4" /> Extensions
      </h2>
      <div className="mb-8 space-y-2">
        {state?.extensions.length === 0 && (
          <p className="text-muted-foreground text-sm">No extensions yet.</p>
        )}
        {state?.extensions.map((ext) => (
          <div key={ext.id} className="rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">{ext.name}</span>
              <span className="text-muted-foreground text-xs">
                {ext.version} · by {ext.author || "unknown"}
              </span>
              <Button
                size="sm"
                className="ml-auto"
                variant={ext.enabled ? "outline" : "default"}
                disabled={!!ext.problem || state.safeMode.on}
                onClick={() =>
                  void run(async () => {
                    await call(() =>
                      api
                        .extensions({ extensionId: ext.id })
                        .enabled.post({ enabled: !ext.enabled }),
                    );
                    await loadCustomize();
                  })
                }
              >
                {ext.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
            {ext.problem && <p className="text-destructive mt-1 text-sm">{ext.problem}</p>}
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {ext.permissions.map((p) => (
                <li
                  key={p}
                  className={cn(
                    "rounded-full border px-2 py-0.5",
                    ext.enabled ? "" : "text-muted-foreground",
                  )}
                >
                  {PERMISSION_TEXT[p] ?? p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <Plug className="size-4" /> MCP servers
      </h2>
      <div className="space-y-2">
        {state?.mcpServers.length === 0 && (
          <p className="text-muted-foreground text-sm">No MCP servers yet.</p>
        )}
        {state?.mcpServers.map((s) => (
          <div key={s.name} className="rounded-xl border p-4 text-sm">
            <span className="font-medium">{s.name}</span>
            <code className="bg-muted ml-2 rounded px-1.5 text-xs">{s.target}</code>
            <p className="text-muted-foreground mt-1">
              for {s.agents.map((a) => `@${a}`).join(", ")}
            </p>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-6 text-xs">App version {state?.appVersion}</p>
    </section>
  );
}

export async function loadCustomize(): Promise<CustomizeState> {
  const state = await call(() => api.customize.get());
  setState(() => ({ customize: state }));
  return state;
}

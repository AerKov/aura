import type { CustomizeState } from "@aura/shared";
import { RAIL_PINNED } from "@aura/shared";
import {
  ArrowDown,
  ArrowUp,
  Blocks,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LayoutDashboard,
  Menu,
  Palette,
  Plug,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { reportError, showIntegrations } from "@/features/chat/actions";
import { setState, useChatStore } from "@/features/chat/store";
import { useRailItems } from "@/features/shell/rail";
import { arrangeRail, moveRailItem } from "@/features/shell/rail-layout";
import { api, call } from "@/lib/api";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { setAppearance } from "./appearance";
import { WindowManagerSettings } from "./window-manager";

const PERMISSION_TEXT: Record<string, string> = {
  "chat.read": "Read chats and messages",
  "chat.write": "Post messages",
  "ui.panel": "Show a panel",
  "alerts.read": "Read alerts",
  storage: "Keep its own data",
  net: "Reach the listed hosts",
  "agents.ask": "Ask agents for you",
  "files.read": "Read project files",
  "apps.call": "Use other apps' actions",
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
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Make it yours" icon={<Palette className="text-primary size-7" />}>
          Ask the orchestrator to change the app (“make a dark blue theme”, “add a panel with
          today's alerts”). Every change is approved by you and committed to <code>~/.aura</code>.
        </PageHeader>
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
          {state?.extensions.map((ext) => {
            const Icon = extensionIcon(ext.icon);
            return (
              <div key={ext.id} className="rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <Icon className="text-primary size-4" />
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
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${ext.name}`}
                    title="Remove (one commit in your data folder, so it can be restored)"
                    onClick={() => {
                      if (!window.confirm(`Remove the extension "${ext.name}"?`)) return;
                      void run(async () => {
                        await call(() => api.extensions({ extensionId: ext.id }).delete());
                        await loadCustomize();
                      });
                    }}
                  >
                    <Trash2 />
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
                {(ext.hosts.length > 0 || ext.secrets.length > 0) && (
                  <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {ext.hosts.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Globe className="size-3" /> {ext.hosts.join(", ")}
                      </span>
                    )}
                    {ext.secrets.length > 0 && (
                      <span
                        className="flex items-center gap-1"
                        title="Aura puts these secrets into its requests; the extension never sees them"
                      >
                        <KeyRound className="size-3" /> {ext.secrets.join(", ")}
                      </span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <LayoutDashboard className="size-4" /> Window manager
        </h2>
        <WindowManagerSettings onError={setError} />

        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <Menu className="size-4" /> Navigation
        </h2>
        <RailEditor onError={setError} />

        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <Plug className="size-4" /> MCP servers
        </h2>
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Add, test and assign them on the{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={showIntegrations}
            >
              Integrations
            </button>{" "}
            page.
          </p>
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
      </div>
    </section>
  );
}

/** Order and visibility of the rail's items (pages and extension panels). */
function RailEditor({ onError }: { onError: (message: string | null) => void }) {
  const layout = useChatStore((s) => s.appearance?.rail);
  const items = arrangeRail(useRailItems(), layout, { withHidden: true });
  const hidden = new Set(layout?.hidden ?? []);
  const keys = items.map((i) => i.key);

  const save = async (rail: { order?: string[]; hidden?: string[] }) => {
    onError(null);
    try {
      await setAppearance({ rail });
    } catch (err) {
      reportError(err);
      onError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="mb-8 rounded-xl border p-2">
      <p className="text-muted-foreground px-2 pt-1 pb-2 text-xs">
        Order of the icons in the bar (items after Customize sit at its end). Hidden pages stay
        reachable from here.
      </p>
      <ul>
        {items.map((item, index) => {
          const off = hidden.has(item.key);
          const pinned = RAIL_PINNED.includes(item.key);
          return (
            <li
              key={item.key}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1 text-sm",
                off && "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" />
              <span className="flex-1 truncate">{item.label}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Move ${item.label} up`}
                disabled={index === 0}
                onClick={() => void save({ order: moveRailItem(keys, item.key, -1) })}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Move ${item.label} down`}
                disabled={index === items.length - 1}
                onClick={() => void save({ order: moveRailItem(keys, item.key, 1) })}
              >
                <ArrowDown />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={off ? `Show ${item.label}` : `Hide ${item.label}`}
                title={pinned ? "Always shown" : off ? "Show" : "Hide"}
                disabled={pinned}
                onClick={() =>
                  void save({
                    hidden: off ? [...hidden].filter((k) => k !== item.key) : [...hidden, item.key],
                  })
                }
              >
                {off ? <EyeOff /> : <Eye />}
              </Button>
            </li>
          );
        })}
      </ul>
      {layout?.order.length || layout?.hidden.length ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1"
          onClick={() => void save({ order: [], hidden: [] })}
        >
          Reset to default
        </Button>
      ) : null}
    </div>
  );
}

export async function loadCustomize(): Promise<CustomizeState> {
  const state = await call(() => api.customize.get());
  setState(() => ({ customize: state }));
  return state;
}

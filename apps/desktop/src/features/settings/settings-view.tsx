import type { EngineId, PageId, SettingsTab } from "@aura/shared";
import { settingsTabOf } from "@aura/shared";
import { Cpu, History, Settings as SettingsIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmbeddedPage } from "@/components/page";
import { AgentAi } from "@/features/agents/agent-ai";
import { BackupsView } from "@/features/backups/backups-view";
import { setState, useChatStore } from "@/features/chat/store";
import { EnginesView } from "@/features/engines/engines-view";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

const TABS: { id: SettingsTab; label: string; icon: typeof Cpu }[] = [
  { id: "ai", label: "AI", icon: Cpu },
  { id: "history", label: "History", icon: History },
];

/**
 * Settings (ADR 0042): where the AI comes from and which model the Helper and @builder use, and
 * the history of removed apps. Everything else is asked of the Helper.
 */
export function SettingsView({ page }: { page: PageId }) {
  const t = useT();
  const requested = useChatStore((s) => s.settingsTab);
  const [tab, setTab] = useState<SettingsTab>(requested ?? settingsTabOf(page));
  useEffect(() => {
    if (!requested) return;
    setTab(requested);
    setState(() => ({ settingsTab: null }));
  }, [requested]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 pt-5 max-md:px-3">
        <h1 className="flex items-center gap-2 text-[22px] [&_svg]:size-5 [&_svg]:stroke-[1.5]">
          <SettingsIcon /> {t("Settings")}
        </h1>
        <div role="tablist" aria-label={t("Settings")} className="-mb-px flex flex-wrap">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] transition-colors",
                tab === id
                  ? "border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              <Icon className="size-4" strokeWidth={1.5} /> {t(label)}
            </button>
          ))}
        </div>
      </header>
      <EmbeddedPage.Provider value={true}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" role="tabpanel">
          {tab === "ai" && (
            <>
              <div className="mx-auto grid w-full max-w-4xl gap-3 px-8 pt-8 max-md:px-4">
                <HelperAi handle="orchestrator" title={t("The Helper's AI")} />
                <HelperAi handle="builder" title={t("The AI that builds your apps (@builder)")} />
              </div>
              <EnginesView />
            </>
          )}
          {tab === "history" && <BackupsView />}
        </div>
      </EmbeddedPage.Provider>
    </section>
  );
}

/** Which AI one of the two helpers uses; @builder appears with the first app. */
function HelperAi({ handle, title }: { handle: string; title: string }) {
  const [current, setCurrent] = useState<{ engine: EngineId | null; model: string | null } | null>(
    null,
  );
  const load = useCallback(() => {
    call(() => api.agents({ handle }).engine.get())
      .then((a) => setCurrent({ engine: a.engine, model: a.model }))
      .catch(() => setCurrent(null));
  }, [handle]);
  useEffect(load, [load]);
  if (!current) return null;
  return (
    <AgentAi
      handle={handle}
      title={title}
      engine={current.engine}
      model={current.model}
      onSaved={() => {
        load();
      }}
    />
  );
}

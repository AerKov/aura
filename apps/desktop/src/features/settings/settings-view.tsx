import { type PageId, type SettingsTab, settingsTabOf } from "@aura/shared";
import { Bot, Cpu, History, Settings as SettingsIcon, Zap } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { EmbeddedPage } from "@/components/page";
import { AgentsView } from "@/features/agents/agents-view";
import { AgentToolServers } from "@/features/agents/tool-servers";
import { BackupsView } from "@/features/backups/backups-view";
import { setState, useChatStore } from "@/features/chat/store";
import { WebhookInfo } from "@/features/chat/webhook-info";
import { EnginesView } from "@/features/engines/engines-view";
import { JobsView } from "@/features/jobs/jobs-view";
import { useT } from "@/features/localization/i18n";
import { MemoryView } from "@/features/memory/memory-view";
import { SkillsView } from "@/features/skills/skills-view";
import { cn } from "@/lib/utils";

const TABS: { id: SettingsTab; label: string; icon: typeof Cpu }[] = [
  { id: "ai", label: "AI", icon: Cpu },
  { id: "helpers", label: "Helpers", icon: Bot },
  { id: "automations", label: "Automations", icon: Zap },
  { id: "history", label: "History", icon: History },
];

type HelpersPart = "team" | "skills" | "memory" | "tools";

/**
 * Settings (ADR 0039): one app with tabs instead of seven. Each tab shows the pages that used to be
 * apps of their own; `page` is the page that was opened, for saved screens and old names.
 */
export function SettingsView({ page }: { page: PageId }) {
  const t = useT();
  const requested = useChatStore((s) => s.settingsTab);
  const [tab, setTab] = useState<SettingsTab>(requested ?? settingsTabOf(page));
  const [part, setPart] = useState<HelpersPart>(
    page === "skills" ? "skills" : page === "memory" ? "memory" : "team",
  );
  // "Open Settings at Helpers" from elsewhere, also when Settings is already open.
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
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px]",
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" role="tabpanel">
          {tab === "ai" && <EnginesView />}
          {tab === "helpers" && (
            <>
              <Segments
                value={part}
                onChange={setPart}
                items={[
                  ["team", t("Team")],
                  ["skills", t("Skill library")],
                  ["memory", t("What they remember")],
                  ["tools", t("Tools and keys")],
                ]}
              />
              {part === "team" && <AgentsView />}
              {part === "skills" && <SkillsView />}
              {part === "memory" && <MemoryView />}
              {part === "tools" && (
                <section className="min-w-0 flex-1 overflow-y-auto px-8 pb-10 max-md:px-4">
                  <div className="mx-auto max-w-3xl">
                    <AgentToolServers />
                  </div>
                </section>
              )}
            </>
          )}
          {tab === "automations" && (
            <Column>
              <JobsView />
              <Card title={t("Alerts from your tools")}>
                <p className="text-muted-foreground mb-3 text-sm">
                  {t(
                    "Monitoring tools post alerts to a web address; your Helper reads them first in the Alerts chat.",
                  )}
                </p>
                <WebhookInfo />
              </Card>
            </Column>
          )}
          {tab === "history" && <BackupsView />}
        </div>
      </EmbeddedPage.Provider>
    </section>
  );
}

/** Several pages one under the other, scrolled together. */
function Column({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [&>section]:flex-none [&>section]:overflow-visible">
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto mb-10 w-full max-w-4xl px-8 max-md:px-4">
      <h2 className="kicker mb-1">{title}</h2>
      {children}
    </div>
  );
}

function Segments<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
}) {
  return (
    <div className="flex shrink-0 gap-1 px-6 pt-4 max-md:px-3">
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "border px-3 py-1 text-[13px]",
            value === id ? "border-primary bg-primary/10" : "hover:bg-accent",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

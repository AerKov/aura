import type { ExtensionInfo } from "@aura/shared";
import { matchesSearch } from "@aura/shared";
import { Plus, Search, Settings, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { setState, useChatStore } from "@/features/chat/store";
import { useT } from "@/features/localization/i18n";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { openApp, openHelper, openSettings, useApps } from "./view";

/** Over this many apps the sidebar offers a search. */
const SEARCH_FROM = 8;

/**
 * The sidebar (ADR 0042): the Helper, the user's apps, a button for a new one, and Settings. On a
 * narrow window it folds to icons.
 */
export function Nav() {
  const t = useT();
  const view = useChatStore((s) => s.view);
  const working = useChatStore((s) => s.streaming);
  const apps = useApps();
  const [query, setQuery] = useState("");
  const shown = apps.filter((a) => matchesSearch(a, query));
  const busy = Object.keys(working).length > 0;

  return (
    <nav
      data-part="sidebar"
      aria-label={t("Aura")}
      className="glass text-sidebar-foreground relative z-10 m-2 mr-0 flex w-[248px] shrink-0 flex-col rounded-[calc(var(--radius)*1.25)] p-2.5 max-lg:w-[68px] max-lg:p-2"
    >
      <div className="flex items-center gap-2.5 px-2 pt-1.5 pb-4 max-lg:justify-center max-lg:px-0">
        <span className="aura-orb aura-orb-sm shrink-0" aria-hidden />
        <span className="text-[17px] font-semibold tracking-tight max-lg:hidden">{t("Aura")}</span>
      </div>

      <NavItem
        active={view.kind === "helper"}
        onClick={openHelper}
        label={t("Helper")}
        icon={
          <span className="relative flex size-5 items-center justify-center">
            <Sparkles className="size-[18px]" />
            {busy && (
              <span className="aura-ping absolute -top-0.5 -right-0.5 size-2 rounded-full" />
            )}
          </span>
        }
      />

      <div className="mt-5 mb-1.5 flex items-center justify-between px-3 max-lg:hidden">
        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          {t("Apps")}
        </span>
      </div>
      {apps.length > SEARCH_FROM && (
        <label className="bg-muted/70 mx-1 mb-1.5 flex items-center gap-2 rounded-full px-3 py-1.5 max-lg:hidden">
          <Search className="text-muted-foreground size-3.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search")}
            aria-label={t("Search apps")}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
      )}
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-2">
        {shown.map((app, i) => (
          <li
            key={app.id}
            className="animate-in fade-in slide-in-from-left-2 fill-mode-both"
            style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
          >
            <AppItem app={app} active={view.kind === "app" && view.id === app.id} />
          </li>
        ))}
        {apps.length === 0 && (
          <li className="text-muted-foreground px-3 py-2 text-[12.5px] leading-snug max-lg:hidden">
            {t("No apps yet. Ask the Helper, or make one here.")}
          </li>
        )}
        <li className="mt-1">
          <button
            type="button"
            onClick={() => setState(() => ({ addOpen: true }))}
            title={t("New app")}
            className="group text-muted-foreground hover:text-foreground flex w-full items-center gap-3 rounded-xl border border-dashed px-3 py-2 text-[13.5px] transition-all duration-300 hover:border-solid hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] max-lg:justify-center max-lg:px-0"
          >
            <Plus className="size-[18px] transition-transform duration-500 ease-[var(--spring)] group-hover:rotate-90" />
            <span className="max-lg:hidden">{t("New app")}</span>
          </button>
        </li>
      </ul>

      <NavItem
        active={view.kind === "settings"}
        onClick={() => openSettings(view.kind === "settings" ? view.tab : "ai")}
        label={t("Settings")}
        icon={<Settings className="size-[18px]" />}
      />
    </nav>
  );
}

function AppItem({ app, active }: { app: ExtensionInfo; active: boolean }) {
  const Icon = extensionIcon(app.icon);
  const changing = Boolean(app.app?.draft);
  return (
    <NavItem
      active={active}
      onClick={() => openApp(app.id)}
      label={app.name}
      hint={app.description ?? undefined}
      icon={
        <span className="app-icon relative flex size-7 items-center justify-center rounded-lg">
          <Icon className="size-4" strokeWidth={1.75} />
          {changing && (
            <span className="aura-fill absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[var(--card)]" />
          )}
        </span>
      }
      dim={!app.enabled}
    />
  );
}

function NavItem({
  active,
  onClick,
  label,
  hint,
  icon,
  dim,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  icon: ReactNode;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={hint ? `${label}: ${hint}` : label}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] transition-all duration-300 ease-[var(--ease)] max-lg:justify-center max-lg:px-0",
        active
          ? "bg-sidebar-active text-sidebar-active-foreground font-medium shadow-sm"
          : "hover:bg-foreground/[0.05] active:scale-[0.98]",
        dim && "opacity-55",
      )}
    >
      {active && <span className="nav-glow" aria-hidden />}
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="truncate max-lg:hidden">{label}</span>
    </button>
  );
}

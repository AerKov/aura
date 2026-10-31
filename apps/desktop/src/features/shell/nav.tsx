import type { ExtensionInfo } from "@aura/shared";
import { matchesSearch } from "@aura/shared";
import { PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AuraLogo } from "@/components/logo";
import { setState, useChatStore } from "@/features/chat/store";
import { useT } from "@/features/localization/i18n";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { openApp, openHelper, openSettings, useApps } from "./view";

/** Over this many apps the sidebar offers a search. */
const SEARCH_FROM = 8;

const FOLDED_KEY = "aura.navFolded";

/** Whether the user folded the menu last time (a per-viewer convenience). */
function readFolded(): boolean {
  try {
    return localStorage.getItem(FOLDED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The sidebar (ADR 0042): the Helper, the user's apps, a button for a new one, and Settings. It
 * folds to icons from its button, and by itself on a narrow window.
 */
export function Nav() {
  const t = useT();
  const view = useChatStore((s) => s.view);
  const working = useChatStore((s) => s.streaming);
  const apps = useApps();
  const [query, setQuery] = useState("");
  const shown = apps.filter((a) => matchesSearch(a, query));
  const busy = Object.keys(working).length > 0;
  const [folded, setFolded] = useState(readFolded);
  const fold = (next: boolean) => {
    setFolded(next);
    try {
      localStorage.setItem(FOLDED_KEY, next ? "1" : "0");
    } catch {
      // Not remembered: it only decides how the menu opens next time.
    }
  };

  return (
    <nav
      data-part="sidebar"
      data-folded={folded}
      aria-label={t("Aura")}
      className="group/nav data-[folded=true]:w-[68px] data-[folded=true]:p-2 bg-sidebar text-sidebar-foreground relative z-10 m-2 mr-0 flex w-[248px] shrink-0 flex-col rounded-[calc(var(--radius)*1.4)] p-2.5 shadow-lg transition-[width,padding] duration-300 ease-[var(--ease)] max-lg:w-[68px] group-data-[folded=true]/nav:w-[68px] max-lg:p-2 group-data-[folded=true]/nav:p-2"
    >
      <div className="flex items-center gap-2.5 px-2 pt-1.5 pb-4 max-lg:justify-center group-data-[folded=true]/nav:justify-center max-lg:px-0 group-data-[folded=true]/nav:px-0">
        <AuraLogo wake className="size-9 ring-0" />
        <span className="text-[17px] font-semibold tracking-tight text-[var(--layer-5)] max-lg:hidden group-data-[folded=true]/nav:hidden">
          {t("Aura")}
        </span>
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

      <div className="mt-5 mb-1.5 flex items-center justify-between px-3 max-lg:hidden group-data-[folded=true]/nav:hidden">
        <span className="text-sidebar-foreground/50 text-[11px] font-medium tracking-wider uppercase">
          {t("Apps")}
        </span>
      </div>
      {apps.length > SEARCH_FROM && (
        <label className="mx-1 mb-1.5 flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--sidebar-fg)_8%,transparent)] px-3 py-1.5 max-lg:hidden group-data-[folded=true]/nav:hidden">
          <Search className="text-sidebar-foreground/50 size-3.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search")}
            aria-label={t("Search apps")}
            className="placeholder:text-sidebar-foreground/40 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
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
          <li className="text-sidebar-foreground/55 px-3 py-2 text-[12.5px] leading-snug max-lg:hidden group-data-[folded=true]/nav:hidden">
            {t("No apps yet. Ask the Helper, or make one here.")}
          </li>
        )}
        <li className="mt-1">
          <button
            type="button"
            onClick={() => setState(() => ({ addOpen: true }))}
            title={t("New app")}
            className="group text-sidebar-foreground/70 flex w-full items-center gap-3 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--sidebar-fg)_22%,transparent)] px-3 py-2 text-[13.5px] transition-all duration-300 hover:border-solid hover:border-[var(--layer-3)] hover:bg-[color-mix(in_srgb,var(--layer-2)_22%,transparent)] hover:text-[var(--layer-5)] max-lg:justify-center group-data-[folded=true]/nav:justify-center max-lg:px-0 group-data-[folded=true]/nav:px-0"
          >
            <Plus className="size-[18px] transition-transform duration-500 ease-[var(--spring)] group-hover:rotate-90" />
            <span className="max-lg:hidden group-data-[folded=true]/nav:hidden">
              {t("New app")}
            </span>
          </button>
        </li>
      </ul>

      <button
        type="button"
        onClick={() => fold(!folded)}
        aria-label={folded ? t("Unfold the menu") : t("Fold the menu")}
        title={folded ? t("Unfold the menu") : t("Fold the menu")}
        className="text-sidebar-foreground/55 hover:text-sidebar-foreground mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[12.5px] transition-colors hover:bg-[color-mix(in_srgb,var(--sidebar-fg)_9%,transparent)] max-lg:hidden group-data-[folded=true]/nav:justify-center group-data-[folded=true]/nav:px-0"
      >
        {folded ? (
          <PanelLeftOpen className="size-[18px]" />
        ) : (
          <PanelLeftClose className="size-[18px]" />
        )}
        <span className="group-data-[folded=true]/nav:hidden">{t("Fold the menu")}</span>
      </button>
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
        <span className="relative flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--sidebar-fg)_8%,transparent)] text-[var(--layer-4)]">
          <Icon className="size-4" strokeWidth={1.75} />
          {changing && (
            <span className="aura-fill absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[var(--sidebar-bg)]" />
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
        "relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] transition-all duration-300 ease-[var(--ease)] max-lg:justify-center group-data-[folded=true]/nav:justify-center max-lg:px-0 group-data-[folded=true]/nav:px-0",
        active
          ? "bg-sidebar-active text-sidebar-active-foreground font-medium shadow-sm"
          : "hover:bg-[color-mix(in_srgb,var(--sidebar-fg)_9%,transparent)] active:scale-[0.98]",
        dim && "opacity-55",
      )}
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="truncate max-lg:hidden group-data-[folded=true]/nav:hidden">{label}</span>
    </button>
  );
}

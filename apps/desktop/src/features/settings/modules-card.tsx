import { MODULE_IDS, MODULES } from "@aura/shared";
import { useT } from "@/features/localization/i18n";
import { ModuleSwitch } from "@/features/shell/home";

/** Turning built-in parts off (ADR 0027), moved from the launcher to Settings → Advanced. */
export function ModulesCard() {
  const t = useT();
  return (
    <div className="bg-card border p-5">
      <h3 className="kicker mb-1">{t("Built-in parts")}</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        {t("Turned off, a part has no routes, tools or background work.")}
      </p>
      <ul className="divide-y">
        {MODULE_IDS.map((id) => (
          <li key={id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t(MODULES[id].name)}</span>
              <span className="text-muted-foreground block text-xs">
                {t(MODULES[id].description)}
              </span>
            </span>
            <ModuleSwitch id={id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

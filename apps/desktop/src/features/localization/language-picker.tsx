import { Languages } from "lucide-react";
import { useState } from "react";
import { useChatStore } from "@/features/chat/store";
import { loadCustomize } from "@/features/customize/state";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "./i18n";

/**
 * One language for Aura (ADR 0033): its interface, the helpers' answers and the apps. "Auto"
 * follows this computer. More languages come as files in `locales/` of the data folder.
 */
export function LanguagePicker() {
  const t = useT();
  const localization = useChatStore((s) => s.customize?.localization);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!localization) return null;

  const choose = async (choice: string) => {
    if (choice === localization.choice) return;
    setBusy(true);
    setError(null);
    try {
      await call(() => api.localization.put({ choice }));
      await loadCustomize();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const options = [
    { code: "auto", name: t("Auto"), hint: t("Follows this computer") },
    ...localization.available.map((l) => ({ code: l.code, name: l.name, hint: l.englishName })),
  ];

  return (
    <div className="flex items-center gap-2">
      <Languages className="text-muted-foreground size-4" strokeWidth={1.5} aria-hidden />
      <fieldset
        aria-label={t("Language")}
        className="bg-muted m-0 flex min-w-0 rounded-full border-0 p-1 shadow-inner"
      >
        {options.map((o) => {
          const on = localization.choice === o.code;
          return (
            <button
              key={o.code}
              type="button"
              aria-pressed={on}
              title={o.hint}
              disabled={busy}
              onClick={() => void choose(o.code)}
              className={cn(
                "rounded-full px-3 py-1 text-[13px] transition-all duration-300 ease-[var(--ease)]",
                on
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.name}
            </button>
          );
        })}
      </fieldset>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}

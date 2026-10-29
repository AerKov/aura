import { Check, Languages } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/page";
import { useChatStore } from "@/features/chat/store";
import { loadCustomize } from "@/features/customize/customize-view";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "./i18n";

/**
 * The Localization app (ADR 0033): one language for Aura's interface, its agents' answers and
 * apps. More languages come as files in `locales/` of the data folder.
 */
export function LocalizationView() {
  const t = useT();
  const locale = useLocale();
  const localization = useChatStore((s) => s.customize?.localization);
  const [error, setError] = useState<string | null>(null);
  if (!localization) return null;

  const choose = async (choice: string) => {
    setError(null);
    try {
      await call(() => api.localization.put({ choice }));
      await loadCustomize();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const options = [
    {
      code: "auto",
      name: t("Automatic"),
      note: t("The interface follows this computer; agents answer in the language you write in."),
    },
    ...localization.available.map((l) => ({
      code: l.code,
      name: l.name,
      note: l.builtin ? l.englishName : `${l.englishName} · locales/${l.code}.json`,
    })),
  ];

  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Language" icon={<Languages className="text-primary size-7" />}>
          {t(
            "One language for Aura: its interface, the answers of its agents, and your apps (they get it as ctx.language and write their texts in it).",
          )}
        </PageHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((o) => {
            const on = localization.choice === o.code;
            return (
              <button
                key={o.code}
                type="button"
                aria-pressed={on}
                onClick={() => void choose(o.code)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                  on ? "border-primary bg-primary/5" : "bg-card hover:bg-accent/60",
                )}
              >
                <Check
                  className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "opacity-0")}
                />
                <span>
                  <span className="block font-medium">{o.name}</span>
                  <span className="text-muted-foreground text-xs">{o.note}</span>
                </span>
              </button>
            );
          })}
        </div>
        {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
        <p className="text-muted-foreground mt-6 text-xs">
          {t("Showing: {name}.", {
            name: localization.available.find((l) => l.code === locale)?.name ?? locale,
          })}{" "}
          {t(
            "Texts without a translation stay in English. To add a language or correct a translation, put locales/<code>.json in Aura's data folder: a name, its English name and the strings.",
          )}
        </p>
      </div>
    </section>
  );
}

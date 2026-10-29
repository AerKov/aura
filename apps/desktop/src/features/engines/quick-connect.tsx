import { type EngineId, FREE_SERVICES, type FreeService } from "@aura/shared";
import { Check, Copy, ExternalLink, KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { loadProviderStatus, reportError } from "@/features/chat/actions";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The shortest way to a working AI (ADR 0037): pick a free service, make a key on its site, paste
 * it here. Aura picks a model and, if nothing else works yet, makes this the default.
 */
export function QuickConnect({ onConnected }: { onConnected?: () => void }) {
  const t = useT();
  const [chosen, setChosen] = useState<FreeService>(FREE_SERVICES[0] as FreeService);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await call(() =>
        api.engines({ engine: chosen.id as ServiceId }).key.put({ key: key.trim() }),
      );
      const list = await call(() => api.engines.get());
      const status = list.engines.find((e) => e.id === chosen.id)?.status;
      if (status && !status.ok) {
        setError(status.reason);
        return;
      }
      setKey("");
      await loadProviderStatus();
      onConnected?.();
    } catch (err) {
      reportError(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(chosen.keyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The address is on screen to copy by hand.
    }
  };

  return (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("Free AI services")}>
        {FREE_SERVICES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === chosen.id}
            onClick={() => {
              setChosen(s);
              setError(null);
            }}
            className={cn(
              "rounded-pill border px-3 py-1 text-[13px]",
              s.id === chosen.id ? "border-primary bg-primary/10" : "hover:bg-accent",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p>{t(chosen.blurb)}</p>
      <ol className="text-muted-foreground list-decimal space-y-1 pl-5">
        <li>
          {t("Make a free key:")}{" "}
          <a
            href={chosen.keyUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-signal-text inline-flex items-center gap-1 underline"
          >
            {chosen.keyUrl.replace("https://", "")} <ExternalLink className="size-3" />
          </a>{" "}
          <button
            type="button"
            onClick={() => void copy()}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? t("Copied") : t("Copy link")}
          </button>
        </li>
        <li>
          {t("Paste it here. It stays on this computer and goes only to {name}.", {
            name: chosen.label,
          })}
        </li>
      </ol>
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          aria-label={t("{name} API key", { name: chosen.label })}
          value={key}
          placeholder={t("paste the key")}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && key.trim().length >= 8 && void connect()}
          className="bg-input-bg border-input focus:border-ring min-w-0 flex-1 border px-3 py-1.5 font-mono text-[13px] outline-none"
        />
        <Button disabled={busy || key.trim().length < 8} onClick={() => void connect()}>
          <KeyRound /> {t("Connect")}
        </Button>
      </div>
      {error && <p className="text-destructive text-[13px]">{error}</p>}
      <p className="text-muted-foreground text-xs">{t(chosen.note)}</p>
    </div>
  );
}

type ServiceId = Extract<EngineId, "google" | "groq" | "openrouter" | "cerebras" | "mistral">;

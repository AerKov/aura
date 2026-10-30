import { formatBytes, LOCAL_MODELS, type LocalAiStatus, type LocalPlan } from "@aura/shared";
import { Check, Download, HardDrive, Loader, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadProviderStatus, reportError } from "@/features/chat/actions";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

const loadBuilds = (tag: string) =>
  call(() => api["local-ai"].builds.get({ query: tag ? { tag } : {} }));
type Builds = Awaited<ReturnType<typeof loadBuilds>>;
const loadReleases = () => call(() => api["local-ai"].releases.get());
type Releases = Awaited<ReturnType<typeof loadReleases>>;

/**
 * The built-in local AI (ADR 0038): Aura installs llama.cpp and downloads a model that fits this
 * computer, after a card says exactly what will come and from where. Progress is shown here.
 */
export function LocalAiCard({
  isDefault,
  onChanged,
}: {
  isDefault: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const [status, setStatus] = useState<LocalAiStatus | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [plan, setPlan] = useState<{ id: string; plan: LocalPlan } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The llama.cpp builds of the latest release, loaded when the user wants to choose one.
  const [builds, setBuilds] = useState<Builds | null>(null);
  const [asset, setAsset] = useState("");
  // The release to install from; "" = the latest.
  const [releases, setReleases] = useState<Releases | null>(null);
  const [tag, setTag] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await call(() => api["local-ai"].get());
      setStatus(next);
      setChoice((c) => c || next.recommended);
      return next;
    } catch (err) {
      reportError(err);
      return null;
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Follow a running download or start until it ends.
  const phase = status?.job.phase;
  useEffect(() => {
    if (phase !== "binary" && phase !== "model" && phase !== "starting") return;
    const timer = setInterval(() => {
      void refresh().then((next) => {
        if (next && next.job.phase !== "binary" && next.job.phase !== "model") {
          onChanged();
          void loadProviderStatus();
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, refresh, onChanged]);

  if (!status) return null;
  const running = phase === "binary" || phase === "model";
  const pick = custom.trim() || choice;

  const makePlan = async (model: string | null) => {
    setBusy(true);
    setError(null);
    try {
      setPlan(
        await call(() =>
          api["local-ai"].plan.post({ model, asset: asset || null, tag: tag || null }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Auto-detection may fail on an unusual system: offer the list of builds right away.
      if (!status?.installed && !builds) void chooseBuild();
    } finally {
      setBusy(false);
    }
  };
  const chooseBuild = async (nextTag = tag) => {
    try {
      if (!releases) void loadReleases().then(setReleases, reportError);
      const next = await loadBuilds(nextTag);
      setBuilds(next);
      setAsset(next.suggested ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const chooseRelease = (next: string) => {
    setTag(next);
    setBuilds(null);
    setAsset("");
    setError(null);
    void chooseBuild(next);
  };
  const approve = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      setStatus(await call(() => api["local-ai"].install.post({ planId: plan.id })));
      setPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<LocalAiStatus>) => {
    try {
      setStatus(await fn());
      onChanged();
      void loadProviderStatus();
    } catch (err) {
      reportError(err);
    }
  };

  const total = status.job.total;
  const percent = total > 0 ? Math.min(100, Math.round((status.job.done / total) * 100)) : 0;

  return (
    <article
      className={cn(
        "bg-card flex flex-col gap-3 border p-5 md:col-span-2",
        isDefault && "border-primary/50 ring-primary/10 ring-4",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <span className="kicker">{t("Aura loop")}</span>
          <h3 className="text-[17px] font-semibold tracking-tight">{t("Built-in local AI")}</h3>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <span className="bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
            {t("free")}
          </span>
          {isDefault && (
            <span className="bg-primary text-primary-foreground px-2 py-0.5 text-[11px] font-medium">
              {t("default")}
            </span>
          )}
        </div>
      </header>
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        {t(
          "Aura installs llama.cpp for you and runs a model on this computer: free and private. Choose a model that fits your memory.",
        )}
      </p>
      <p className="flex items-center gap-2 text-[13px]">
        <HardDrive className="size-4" />
        {status.installed
          ? t("llama.cpp {tag} ({variant}) is installed.", {
              tag: status.installed,
              variant: status.variant ?? "",
            })
          : t("llama.cpp is not installed yet.")}{" "}
        {t("This computer has {gb} GB of memory.", { gb: status.ramGb })}
      </p>

      {status.models.length > 0 && (
        <ul className="divide-y border">
          {status.models.map((m) => (
            <li key={m.file} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{m.file}</span>
              <span className="text-muted-foreground font-mono text-xs">{formatBytes(m.size)}</span>
              {status.running === m.file && (
                <span className="text-signal-text text-xs">{t("running")}</span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void act(async () => {
                    const next = await call(() => api["local-ai"].use.post({ file: m.file }));
                    return next;
                  })
                }
              >
                <Check /> {t("Use")}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t("Remove {name}", { name: m.file })}
                onClick={() =>
                  void act(() => call(() => api["local-ai"].models({ file: m.file }).delete()))
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {running ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between text-[13px]">
            <span className="flex items-center gap-2">
              <Loader className="size-4 animate-spin" />
              {status.job.phase === "binary"
                ? t("Downloading llama.cpp")
                : t("Downloading the model")}{" "}
              <span className="text-muted-foreground font-mono text-xs">{status.job.label}</span>
            </span>
            <span className="font-mono text-xs">
              {formatBytes(status.job.done)} / {total ? formatBytes(total) : "?"} · {percent}%
            </span>
          </div>
          <div className="bg-muted h-2 w-full">
            <div className="bg-primary h-2 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() => void call(() => api["local-ai"].cancel.post()).then(refresh)}
          >
            {t("Stop")}
          </Button>
        </div>
      ) : plan ? (
        <PlanCard
          plan={plan.plan}
          busy={busy}
          onYes={() => void approve()}
          onNo={() => setPlan(null)}
        />
      ) : (
        <div className="grid gap-3">
          <fieldset className="grid gap-1.5">
            <legend className="kicker mb-1">
              {status.models.length > 0 ? t("Add another model") : t("Choose a model")}
            </legend>
            {LOCAL_MODELS.map((m) => {
              const fits = m.ramGb <= status.ramGb;
              return (
                <label
                  key={m.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 border px-3 py-2 text-[13px]",
                    choice === m.id && !custom.trim() && "border-primary bg-primary/10",
                  )}
                >
                  <input
                    type="radio"
                    name="local-model"
                    className="mt-1"
                    checked={choice === m.id && !custom.trim()}
                    onChange={() => {
                      setChoice(m.id);
                      setCustom("");
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{m.label}</span>{" "}
                    <span className="text-muted-foreground font-mono text-xs">~{m.sizeGb} GB</span>
                    {m.id === status.recommended && (
                      <span className="text-signal-text ml-2 text-xs">{t("recommended")}</span>
                    )}
                    <span className="text-muted-foreground block text-xs">{t(m.note)}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      fits ? "text-muted-foreground" : "text-warning-text",
                    )}
                  >
                    {fits ? t("fits") : t("needs ~{gb} GB", { gb: m.ramGb })}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <label className="block">
            <span className="kicker mb-1 block">{t("Or any GGUF model from Hugging Face")}</span>
            <input
              className="bg-input-bg border-input focus:border-ring w-full border px-3 py-2 font-mono text-[13px] outline-none"
              value={custom}
              placeholder="owner/name:Q4_K_M"
              onChange={(e) => setCustom(e.target.value)}
            />
          </label>
          {releases && (
            <label className="block">
              <span className="kicker mb-1 block">{t("llama.cpp release")}</span>
              <select
                className="bg-input-bg border-input focus:border-ring w-full border px-3 py-2 font-mono text-[12.5px] outline-none"
                value={tag}
                onChange={(e) => chooseRelease(e.target.value)}
              >
                <option value="">{t("The latest")}</option>
                {releases.map((r) => (
                  <option key={r.tag} value={r.tag}>
                    {r.tag}
                    {r.published ? ` · ${new Date(r.published).toLocaleDateString()}` : ""}
                    {r.fits ? ` · ${t("fits this computer")}` : ` · ${t("no build recognized")}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {builds ? (
            <label className="block">
              <span className="kicker mb-1 block">
                {t("llama.cpp build ({tag})", { tag: builds.tag })}
              </span>
              <select
                className="bg-input-bg border-input focus:border-ring w-full border px-3 py-2 font-mono text-[12.5px] outline-none"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
              >
                <option value="">{t("Choose automatically")}</option>
                {builds.builds.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} · {b.os ?? "?"}/{b.arch ?? "?"}/{b.variant} · {formatBytes(b.size)}
                    {b.sha256 ? "" : ` · ${t("no checksum")}`}
                    {b.name === builds.suggested ? ` · ${t("recommended")}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground justify-self-start text-[12.5px] underline-offset-2 hover:underline"
              onClick={() => void chooseBuild()}
            >
              {status.installed
                ? t("Install another llama.cpp release")
                : t("Choose the llama.cpp build yourself")}
            </button>
          )}
          {builds && builds.builds.length === 0 && (
            <p className="text-warning-text text-[13px]">
              {t("This release has no program archives. Choose another release.")}
            </p>
          )}
          {error && <p className="text-destructive text-[13px]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !pick} onClick={() => void makePlan(pick)}>
              <Download />{" "}
              {status.installed ? t("Download the model…") : t("Install and download…")}
            </Button>
            {status.installed && (
              <Button
                variant="ghost"
                onClick={() => void act(() => call(() => api["local-ai"].delete()))}
              >
                <Trash2 /> {t("Remove llama.cpp and all models")}
              </Button>
            )}
          </div>
          {status.job.phase === "error" && status.job.error && (
            <p className="text-destructive text-[13px]">{status.job.error}</p>
          )}
        </div>
      )}
    </article>
  );
}

/** What will be downloaded and from where; nothing happens until "Yes". */
function PlanCard({
  plan,
  busy,
  onYes,
  onNo,
}: {
  plan: LocalPlan;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  const t = useT();
  const nothing = !plan.binary && !plan.model;
  return (
    <div className="border-warning/65 grid gap-2.5 border p-3.5">
      <span className="text-warning-text text-xs font-semibold">
        {t("Your decision is needed")}
      </span>
      <h4 className="text-[18px]">
        {nothing ? t("Everything is already here") : t("Download to this computer?")}
      </h4>
      <ul className="grid gap-1.5 text-[14px]">
        {plan.binary && (
          <li>
            <span className="text-signal-text">+</span>{" "}
            {t(
              "The llama.cpp program {tag}, {size}, from github.com/ggml-org/llama.cpp. Its checksum is checked.",
              { tag: plan.binary.tag, size: formatBytes(plan.binary.size) },
            )}
          </li>
        )}
        {plan.model && (
          <li>
            <span className="text-signal-text">+</span>{" "}
            {t("The model {file}, {size}, from huggingface.co/{repo}.", {
              file: plan.model.file,
              size: formatBytes(plan.model.size),
              repo: plan.model.repo,
            })}
            {plan.model.sha256 ? ` ${t("Its checksum is checked.")}` : ""}
          </li>
        )}
      </ul>
      <p className="text-muted-foreground text-[13px]">
        {t("It runs only on this computer, and only while a helper uses it.")}
        {plan.freeBytes !== null
          ? ` ${t("Free disk space: {size}.", { size: formatBytes(plan.freeBytes) })}`
          : ""}
      </p>
      <div className="flex gap-2">
        <Button disabled={busy || nothing} onClick={onYes}>
          {t("Yes, download")}
        </Button>
        <Button variant="outline" onClick={onNo}>
          {t("No, thanks")}
        </Button>
      </div>
    </div>
  );
}

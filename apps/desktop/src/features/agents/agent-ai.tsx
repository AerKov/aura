import type { EngineId } from "@aura/shared";
import { useEffect, useState } from "react";
import { SaveButton } from "@/components/save-button";
import { reportError } from "@/features/chat/actions";
import { inputClass, ModelInput, useModels } from "@/features/engines/engines-view";
import { useT } from "@/features/localization/i18n";
import { openSettings } from "@/features/settings/open";
import { api, call } from "@/lib/api";

type Engines = Awaited<ReturnType<typeof loadEngines>>;
const loadEngines = () => call(() => api.engines.get());

/**
 * Which AI a helper thinks with (ADR 0039): the default, or one of the connected ones, and a model.
 * The only place a helper's AI is chosen; connections are made in Settings → AI.
 */
export function AgentAi({
  handle,
  engine: current,
  model: currentModel,
  onSaved,
}: {
  handle: string;
  engine: EngineId | null;
  model: string | null;
  onSaved: () => void;
}) {
  const t = useT();
  const [engines, setEngines] = useState<Engines | null>(null);
  const [engine, setEngine] = useState<EngineId | "">(current ?? "");
  const [model, setModel] = useState(currentModel ?? "");
  useEffect(() => {
    loadEngines().then(setEngines).catch(reportError);
  }, []);
  useEffect(() => {
    setEngine(current ?? "");
    setModel(currentModel ?? "");
  }, [current, currentModel]);

  const chosen = engines?.engines.find((e) => e.id === engine);
  const models = useModels(engine || "claude-code", engine !== "" && chosen?.status.ok === true);
  const fallback = engines?.engines.find((e) => e.id === engines.default);
  const dirty = (current ?? "") !== engine || (currentModel ?? "") !== model;
  // Connected ones first: an engine that is not ready cannot answer.
  const options = [...(engines?.engines ?? [])].sort(
    (a, b) => Number(b.status.ok) - Number(a.status.ok),
  );

  const save = async () => {
    await call(() =>
      api.agents({ handle }).engine.put({ engine: engine || null, model: model.trim() || null }),
    );
    onSaved();
  };

  return (
    <div className="bg-card border p-5">
      <h3 className="kicker mb-1">{t("Its AI")}</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        {t("Pick from the AI you connected.")}{" "}
        <button
          type="button"
          className="text-signal-text underline"
          onClick={() => openSettings("ai")}
        >
          {t("Connect another")}
        </button>
      </p>
      <div className="grid items-center gap-2 md:grid-cols-[14rem_1fr_auto]">
        <select
          aria-label={t("Its AI")}
          className={inputClass}
          value={engine}
          onChange={(e) => {
            setEngine(e.target.value as EngineId | "");
            setModel("");
          }}
        >
          <option value="">{t("Default ({name})", { name: fallback?.label ?? "…" })}</option>
          {options.map((e) => (
            <option key={e.id} value={e.id}>
              {e.status.ok ? e.label : `${e.label} · ${t("not connected")}`}
            </option>
          ))}
        </select>
        {engine ? (
          <ModelInput
            label={t("Model")}
            models={models}
            value={model}
            onChange={setModel}
            placeholder={chosen?.model ?? t("its default model")}
          />
        ) : (
          <span className="text-muted-foreground text-xs">
            {fallback?.model ?? t("the default model")}
          </span>
        )}
        <SaveButton
          size="sm"
          variant={dirty ? "default" : "ghost"}
          disabled={!dirty}
          onSave={save}
        />
      </div>
    </div>
  );
}

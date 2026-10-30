import {
  BAR_APP_ID,
  BAR_EDGES,
  BAR_MODES,
  BAR_SIZE,
  type BarMode,
  MOD_KEYS,
  type ModKey,
  TITLE_STYLES,
  type WindowStyle,
  WM_PRESETS,
  type WmPreset,
} from "@aura/shared";
import { MessagesSquare } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { openChat, reportError } from "@/features/chat/actions";
import { setState, useChatStore } from "@/features/chat/store";
import { Versions } from "@/features/shell/app-controls";
import { modLabel } from "@/features/shell/rail";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { setAppearance } from "./appearance";
import { loadCustomize } from "./customize-view";

const MODE_LABEL = { builtin: "Built-in", app: "Your own (code)", off: "Off" } as const;

/**
 * Which bar shows (ADR 0029). "Your own" makes the bar an app whose code is changed in its chat,
 * with approval and versions; the built-in bar stands in when it fails.
 */
function BarChoice({ onError }: { onError: (message: string | null) => void }) {
  const mode = useChatStore((s) => s.appearance?.rail.mode ?? "builtin");
  const failed = useChatStore((s) => s.barFailed);
  const bar = useChatStore((s) => s.customize?.extensions.find((e) => e.id === BAR_APP_ID));
  const preview = useChatStore((s) => s.previewDraft[BAR_APP_ID] ?? false);
  const choose = async (next: BarMode) => {
    onError(null);
    try {
      if (next === "app") await call(() => api.bar.post());
      await setAppearance({ rail: { mode: next } });
      await loadCustomize();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <>
      <Choice
        label="Bar"
        value={mode}
        options={BAR_MODES}
        names={(m) => MODE_LABEL[m]}
        onChange={(m) => void choose(m)}
      />
      {mode === "off" && (
        <p className="text-muted-foreground py-1 pl-31 text-xs">
          No bar: use Home (Mod+H) and the keyboard. Phones keep their tab bar.
        </p>
      )}
      {mode === "app" && bar?.app && (
        <div className="flex flex-wrap items-center gap-2 py-1.5 pl-31 text-xs">
          {
            <Button size="sm" variant="outline" onClick={() => openChat(bar.app?.chatId ?? "")}>
              <MessagesSquare /> Change it in its chat
            </Button>
          }
          {bar.app.draft && (
            <Button
              size="sm"
              variant={preview ? "secondary" : "outline"}
              onClick={() =>
                setState((s) => ({
                  previewDraft: { ...s.previewDraft, [BAR_APP_ID]: !preview },
                }))
              }
            >
              {preview ? "Show the live bar" : "Try the change waiting for approval"}
            </Button>
          )}
          <span className="text-muted-foreground">Versions</span>
          <Versions appId={BAR_APP_ID} />
        </div>
      )}
      {mode === "app" && (failed || (bar && !bar.enabled)) && (
        <p className="py-1 pl-31 text-xs text-amber-600 dark:text-amber-400">
          Your bar {failed ? `failed (${failed})` : "is turned off after errors"}, so the built-in
          bar is shown. Fix it in its chat or restore a version, then{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setState(() => ({ barFailed: null }));
              if (bar && !bar.enabled)
                void call(() =>
                  api.extensions({ extensionId: BAR_APP_ID }).enabled.post({ enabled: true }),
                )
                  .then(() => loadCustomize())
                  .catch(reportError);
            }}
          >
            try again
          </button>
          .
        </p>
      )}
    </>
  );
}

/** The bar's thickness (WISH-1): the default, or a number of px. */
function BarSize() {
  const rail = useChatStore((s) => s.appearance?.rail);
  const [local, setLocal] = useState<number | null>(rail?.size ?? null);
  useEffect(() => setLocal(rail?.size ?? null), [rail?.size]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!rail) return null;
  const fallback = rail.edge === "left" || rail.edge === "right" ? 56 : 48;
  const save = (size: number | null) => {
    setLocal(size);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => void setAppearance({ rail: { size } }).catch(reportError),
      300,
    );
  };
  return (
    <Row label="Bar thickness">
      <input
        type="range"
        min={BAR_SIZE.min}
        max={BAR_SIZE.max}
        value={local ?? fallback}
        aria-label="Bar thickness"
        onChange={(e) => save(Number(e.target.value))}
        className="accent-primary w-48"
      />
      <span className="w-10 font-mono text-xs tabular-nums">{local ?? fallback}px</span>
      {local !== null && (
        <button
          type="button"
          className="text-muted-foreground text-xs underline"
          onClick={() => save(null)}
        >
          Default
        </button>
      )}
      {local !== null && local < BAR_SIZE.builtinMin && rail.mode !== "app" && (
        <span className="text-muted-foreground text-xs">
          The built-in bar needs {BAR_SIZE.builtinMin}px; thinner sizes are for your own bar.
        </span>
      )}
    </Row>
  );
}

const TITLE_LABEL = { full: "Full", minimal: "Thin", none: "Hidden" } as const;
const EDGE_LABEL = { left: "Left", right: "Right", top: "Top", bottom: "Bottom" } as const;

/** One choice among a few, as a row of toggle buttons. */
function Choice<T extends string>({
  label,
  value,
  options,
  names,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  names: (option: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <Row label={label}>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs",
              value === option ? "border-primary bg-primary/10" : "hover:bg-accent",
            )}
          >
            {names(option)}
          </button>
        ))}
      </div>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-1.5">
      <span className="text-muted-foreground w-28 shrink-0 text-sm">{label}</span>
      {children}
    </div>
  );
}

/** A number in px: shown at once through its CSS variable, saved once the user stops dragging. */
function Slider({
  label,
  value,
  max,
  cssVar,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  cssVar: string;
  onChange: (value: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (next: number) => {
    setLocal(next);
    document.documentElement.style.setProperty(cssVar, `${next}px`);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 300);
  };
  return (
    <Row label={label}>
      <input
        type="range"
        min={0}
        max={max}
        value={local}
        aria-label={label}
        onChange={(e) => change(Number(e.target.value))}
        className="accent-primary w-48"
      />
      <span className="w-10 font-mono text-xs tabular-nums">{local}px</span>
    </Row>
  );
}

const SHORTCUTS: [string, string][] = [
  ["←↑→↓", "focus the tile in that direction"],
  ["Shift+←↑→↓", "swap the tile with that one"],
  ["Enter", "new tile on the right (Home)"],
  ["Shift+Enter", "new tile below"],
  ["Q", "close the tile"],
  ["H", "Home"],
  ["1…9", "the bar's apps in order"],
];

/**
 * The window layout settings (ADR 0028): a preset (Airy or Compact), then gaps, corners,
 * borders and title bars, the bar's edge and the shortcuts' Mod key.
 */
export function WindowManagerSettings({ onError }: { onError: (message: string | null) => void }) {
  const appearance = useChatStore((s) => s.appearance);
  if (!appearance) return null;
  const wm = appearance.wm;
  const save = (change: { wm?: Partial<WindowStyle>; edge?: (typeof BAR_EDGES)[number] }) => {
    onError(null);
    setAppearance({
      wm: change.wm,
      rail: change.edge ? { edge: change.edge } : undefined,
    }).catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
  };
  const presets = Object.keys(WM_PRESETS) as WmPreset[];
  const active = presets.find((p) =>
    Object.entries(WM_PRESETS[p]).every(([k, v]) => wm[k as keyof WindowStyle] === v),
  );
  return (
    <div className="mb-8 rounded-xl border p-4">
      <Row label="Preset">
        <div className="flex gap-1">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={active === preset}
              onClick={() => save({ wm: WM_PRESETS[preset] })}
              className={cn(
                "rounded-lg border px-3 py-1 text-sm",
                active === preset ? "border-primary bg-primary/10" : "hover:bg-accent",
              )}
            >
              {preset === "compact" ? "Compact" : "Airy"}
            </button>
          ))}
          {!active && <span className="text-muted-foreground self-center text-xs">Custom</span>}
        </div>
      </Row>
      <Slider
        label="Gaps"
        value={wm.gaps}
        max={24}
        cssVar="--wm-gap"
        onChange={(gaps) => save({ wm: { gaps } })}
      />
      <Slider
        label="Corners"
        value={wm.radius}
        max={24}
        cssVar="--wm-radius"
        onChange={(radius) => save({ wm: { radius } })}
      />
      <Slider
        label="Borders"
        value={wm.border}
        max={4}
        cssVar="--wm-border"
        onChange={(border) => save({ wm: { border } })}
      />
      <Choice
        label="Title bars"
        value={wm.titles}
        options={TITLE_STYLES}
        names={(t) => TITLE_LABEL[t]}
        onChange={(titles) => save({ wm: { titles } })}
      />
      <BarChoice onError={onError} />
      <Choice
        label="Bar edge"
        value={appearance.rail.edge}
        options={BAR_EDGES}
        names={(e) => EDGE_LABEL[e]}
        onChange={(edge) => save({ edge })}
      />
      <BarSize />
      <Choice
        label="Mod key"
        value={wm.mod}
        options={MOD_KEYS}
        names={(m: ModKey) => modLabel(m)}
        onChange={(mod) => save({ wm: { mod } })}
      />
      <details className="mt-2 text-sm">
        <summary className="text-muted-foreground cursor-pointer">Keyboard shortcuts</summary>
        <ul className="mt-2 grid gap-1">
          {SHORTCUTS.map(([keys, what]) => (
            <li key={keys} className="flex gap-3">
              <kbd className="bg-muted w-36 shrink-0 rounded px-1.5 font-mono text-xs">
                {modLabel(wm.mod)}+{keys}
              </kbd>
              <span className="text-muted-foreground">{what}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-2 text-xs">
          They work when the focus is not inside an app's own frame. In a text field, Mod+arrows
          keep moving by word.
        </p>
      </details>
    </div>
  );
}

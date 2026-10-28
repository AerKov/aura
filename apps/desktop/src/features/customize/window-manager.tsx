import {
  BAR_EDGES,
  MOD_KEYS,
  type ModKey,
  TITLE_STYLES,
  type WindowStyle,
  WM_PRESETS,
  type WmPreset,
} from "@aura/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/features/chat/store";
import { modLabel } from "@/features/shell/rail";
import { cn } from "@/lib/utils";
import { setAppearance } from "./appearance";

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
 * The window manager's settings (ADR 0028): a preset (Hyprland or i3), then gaps, corners,
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
              {preset === "i3" ? "i3" : "Hyprland"}
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
      <Choice
        label="Bar"
        value={appearance.rail.edge}
        options={BAR_EDGES}
        names={(e) => EDGE_LABEL[e]}
        onChange={(edge) => save({ edge })}
      />
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

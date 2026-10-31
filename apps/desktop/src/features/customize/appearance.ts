import type { Appearance, RailLayout, WindowStyle } from "@aura/shared";
import { setState } from "@/features/chat/store";
import { api, call } from "@/lib/api";

const PREFIX = "aura-css-";
const TRY_ID = "aura-try-css";

/**
 * Injects the active theme and snippets as <style> elements after the app's own CSS, and the tile
 * style as CSS variables (ADR 0028) that themes may use too.
 */
function apply(appearance: Appearance): void {
  const root = document.documentElement.style;
  root.setProperty("--wm-gap", `${appearance.wm.gaps}px`);
  root.setProperty("--wm-radius", `${appearance.wm.radius}px`);
  root.setProperty("--wm-border", `${appearance.wm.border}px`);
  for (const el of document.querySelectorAll(`style[id^="${PREFIX}"]`)) el.remove();
  for (const { name, css } of appearance.css) {
    const style = document.createElement("style");
    style.id = `${PREFIX}${name.replace(/[^a-z0-9-]/gi, "-")}`;
    style.textContent = css;
    document.head.appendChild(style);
  }
}

export async function loadAppearance(): Promise<void> {
  const appearance = await call(() => api.appearance.get());
  apply(appearance);
  setState(() => ({ appearance }));
}

/** Temporarily applies proposed CSS (from an approval card) on top of everything. */
export function tryCss(css: string | null): void {
  document.getElementById(TRY_ID)?.remove();
  if (!css) return;
  const style = document.createElement("style");
  style.id = TRY_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

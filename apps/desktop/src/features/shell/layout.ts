import {
  type AppRef,
  closeApp,
  closeTile,
  focus,
  focusedTile,
  type Layout,
  openApp,
  type Placement,
  resize,
} from "@aura/shared";
import { getState, setState } from "@/features/chat/store";
import { api, call } from "@/lib/api";

export const PHONE_QUERY = "(max-width: 767px)";

/** Phones show one app at a time and leave the saved tiles alone. */
export function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches;
}

/** The app on screen: on a phone its own choice, else the focused tile's. */
export function phoneAppOf(s: { phoneApp: AppRef | null; layout: Layout }): AppRef {
  return s.phoneApp ?? focusedTile(s.layout).app;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving = false;

function report(error: unknown): void {
  console.error("aura: layout", error instanceof Error ? error.message : error);
}

/** Shows a layout now and saves it shortly after (ADR 0024). */
export function setLayout(next: Layout): void {
  setState(() => ({ layout: next }));
  saving = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    call(() => api.layout.put(getState().layout))
      .then((saved) => setState(() => ({ layout: saved })))
      .catch(report)
      .finally(() => {
        saving = false;
      });
  }, 300);
}

export async function loadLayout(): Promise<void> {
  const layout = await call(() => api.layout.get());
  setState(() => ({ layout }));
}

/** A layout from the server (the orchestrator, another window); local edits in flight win. */
export function receiveLayout(layout: Layout): void {
  if (!saving) setState(() => ({ layout }));
}

export function openAppRef(app: AppRef, where: Placement = "here"): void {
  if (isPhone()) {
    setState(() => ({ phoneApp: app }));
    return;
  }
  setLayout(openApp(getState().layout, app, where));
}

export function closeAppRef(app: AppRef): void {
  setLayout(closeApp(getState().layout, app));
}

export function closeTileId(tileId: string): void {
  setLayout(closeTile(getState().layout, tileId));
}

export function focusTile(tileId: string): void {
  const layout = getState().layout;
  if (layout.focused !== tileId) setLayout(focus(layout, tileId));
}

export function resizeSplit(splitId: string, sizes: number[]): void {
  setLayout(resize(getState().layout, splitId, sizes));
}

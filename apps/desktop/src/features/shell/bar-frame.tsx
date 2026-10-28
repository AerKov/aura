import type { BarEdge, ExtensionInfo, Placement } from "@aura/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { setState, useChatStore } from "@/features/chat/store";
import { type BarHost, ExtensionFrame } from "@/features/customize/extension-frame";
import { cn } from "@/lib/utils";

/** How long the bar app has to ask for its state before the built-in bar stands in. */
const START_TIMEOUT_MS = 8000;

type MenuItem = { label: string; value: string };

const SIZE: Record<BarEdge, string> = {
  left: "w-14 border-r",
  right: "w-14 border-l",
  top: "h-12 w-full border-b",
  bottom: "h-12 w-full border-t",
};

const MENU_AT: Record<BarEdge, string> = {
  left: "left-16 top-2",
  right: "right-16 top-2",
  top: "top-14 left-2",
  bottom: "bottom-14 left-2",
};

/** The built-in bar takes over and says why (ADR 0029). */
export function failBar(reason: string): void {
  console.warn("aura: the bar app failed; showing the built-in bar:", reason);
  setState(() => ({ barFailed: reason }));
}

/**
 * The user's bar app (ADR 0029) in a sandboxed frame on the bar's edge. It must ask for its state
 * soon after loading and must not report errors; otherwise the built-in bar stands in.
 */
export function BarFrame({
  ext,
  edge,
  state,
  open,
}: {
  ext: ExtensionInfo;
  edge: BarEdge;
  state: unknown;
  open: (key: string, where: Placement) => void;
}) {
  const draft = useChatStore((s) => Boolean(ext.app?.draft && s.previewDraft[ext.id]));
  const [menu, setMenu] = useState<{ items: MenuItem[]; done: (v: string | null) => void } | null>(
    null,
  );
  const ready = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openRef = useRef(open);
  openRef.current = open;

  const host: BarHost = useMemo(
    () => ({
      state: () => stateRef.current,
      open: (key, where) => openRef.current(key, where),
      menu: (items) =>
        new Promise((resolve) => {
          setMenu((current) => {
            current?.done(null);
            return { items, done: resolve };
          });
        }),
    }),
    [],
  );

  const revision = `${ext.app?.revision ?? ""}:${draft}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart the watch for each version
  useEffect(() => {
    ready.current = false;
    const timer = setTimeout(() => {
      if (!ready.current) failBar("it did not start");
    }, START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [revision]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        menu.done(null);
        setMenu(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);

  const pick = (value: string | null) => {
    menu?.done(value);
    setMenu(null);
  };

  return (
    <div className={cn("bg-rail relative z-20 flex shrink-0 max-md:hidden", SIZE[edge])}>
      <ExtensionFrame
        key={revision}
        extension={ext}
        variant="bar"
        draft={draft}
        bar={host}
        barState={state}
        onReady={() => {
          ready.current = true;
        }}
        onError={(message) => failBar(message)}
      />
      {menu && (
        <>
          <button
            type="button"
            aria-label="Close the menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => pick(null)}
          />
          <div
            role="menu"
            className={cn(
              "bg-popover text-popover-foreground absolute z-40 min-w-44 rounded-xl border p-1 shadow-lg",
              MENU_AT[edge],
            )}
          >
            {menu.items.map((item) => (
              <button
                key={item.value}
                type="button"
                role="menuitem"
                className="hover:bg-accent block w-full rounded-lg px-2.5 py-1.5 text-left text-sm"
                onClick={() => pick(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

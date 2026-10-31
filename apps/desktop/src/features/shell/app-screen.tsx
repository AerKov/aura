import type { ExtensionInfo } from "@aura/shared";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatView } from "@/features/chat/chat-view";
import { setState, useChatStore } from "@/features/chat/store";
import { ExtensionFrame } from "@/features/customize/extension-frame";
import { loadCustomize } from "@/features/customize/state";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { AppControls, AppSecretsMenu } from "./app-controls";
import { AppMenu } from "./app-menu";
import { useApps } from "./view";

/**
 * An app on screen (ADR 0042): its frame on a card, and its chat beside it, where @builder
 * changes it. The chat can be folded away.
 */
export function AppScreen({ id }: { id: string }) {
  const t = useT();
  const apps = useApps();
  const ext = apps.find((e) => e.id === id);
  const hidden = useChatStore((s) => s.appChatHidden[id] ?? false);
  const draft = useChatStore((s) => Boolean(ext?.app?.draft && s.previewDraft[id]));
  if (!ext) return <AppUnavailable id={id} />;
  const Icon = extensionIcon(ext.icon);
  const chatId = ext.app?.chatId;
  const toggleChat = () =>
    setState((s) => ({ appChatHidden: { ...s.appChatHidden, [id]: !hidden } }));

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section
        data-part="app"
        aria-label={ext.name}
        className="bg-app-card border-app-border view-in @container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[calc(var(--radius)*1.25)] border shadow-md"
      >
        <header className="flex h-[52px] shrink-0 items-center gap-1 border-b px-3">
          <span className="app-icon mr-1.5 flex size-8 items-center justify-center rounded-[10px]">
            <Icon className="size-[17px]" strokeWidth={1.75} />
          </span>
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-[15px] leading-tight font-semibold">{ext.name}</h1>
            {ext.description && (
              <p className="text-muted-foreground truncate text-[11.5px] leading-tight">
                {ext.description}
              </p>
            )}
          </div>
          {ext.app ? (
            <AppControls ext={ext} />
          ) : (
            ext.secrets.length > 0 && <AppSecretsMenu appId={ext.id} />
          )}
          <AppMenu extension={ext} />
          {chatId && (
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground size-8 rounded-full"
              aria-label={hidden ? t("Show the chat") : t("Hide the chat")}
              title={hidden ? t("Show the chat") : t("Hide the chat")}
              onClick={toggleChat}
            >
              {hidden ? <PanelRightOpen /> : <PanelRightClose />}
            </Button>
          )}
        </header>
        <div className={cn("relative flex min-h-0 min-w-0 flex-1", draft && "draft-glow")}>
          {ext.enabled ? (
            <ExtensionFrame
              // A new approved version or the draft preview reloads the frame.
              key={`${ext.id}:${ext.app?.revision ?? ""}:${draft}`}
              extension={ext}
              variant="side"
              draft={draft}
              context={{ chatId: chatId ?? null, projectId: ext.id }}
            />
          ) : (
            <AppUnavailable id={id} info={ext} />
          )}
        </div>
      </section>
      {chatId && !hidden && <ChatPane chatId={chatId} />}
    </div>
  );
}

const WIDTH_KEY = "aura.appChatWidth";
const MIN_CHAT = 300;
const DEFAULT_CHAT = 400;

function readWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(saved) && saved >= MIN_CHAT ? saved : DEFAULT_CHAT;
  } catch {
    return DEFAULT_CHAT;
  }
}

/**
 * An app's chat beside it, as wide as the user drags it (or sets it with the arrow keys on the
 * handle). The width is kept for next time (a per-viewer convenience); the app keeps at least a
 * third of the room.
 */
function ChatPane({ chatId }: { chatId: string }) {
  const t = useT();
  const [width, setWidth] = useState(readWidth);
  const [dragging, setDragging] = useState(false);
  const pane = useRef<HTMLElement>(null);
  const clamp = (w: number) => {
    const room = pane.current?.parentElement?.clientWidth ?? window.innerWidth;
    return Math.round(Math.min(Math.max(w, MIN_CHAT), Math.max(MIN_CHAT, room * 0.67)));
  };
  const keep = (w: number) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(w));
    } catch {
      // Not kept: it only decides how wide the chat opens next time.
    }
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Captured, so the drag goes on over the app's frame too.
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = width;
    setDragging(true);
    const move = (ev: PointerEvent) => setWidth(clamp(startWidth + (startX - ev.clientX)));
    const up = (ev: PointerEvent) => {
      const target = e.target as HTMLElement;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setDragging(false);
      keep(clamp(startWidth + (startX - ev.clientX)));
    };
    e.currentTarget.addEventListener("pointermove", move);
    e.currentTarget.addEventListener("pointerup", up);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 20;
    const next =
      e.key === "ArrowLeft" ? width + step : e.key === "ArrowRight" ? width - step : null;
    if (next === null) return;
    e.preventDefault();
    const w = clamp(next);
    setWidth(w);
    keep(w);
  };
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a draggable splitter has no native element; it is a focusable separator with arrow keys */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("Chat width")}
        aria-valuenow={width}
        aria-valuemin={MIN_CHAT}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={() => {
          setWidth(DEFAULT_CHAT);
          keep(DEFAULT_CHAT);
        }}
        title={t("Drag to make the chat wider or narrower")}
        className="group/split flex w-2 shrink-0 cursor-col-resize items-center justify-center outline-none max-md:hidden"
      >
        <span
          className={cn(
            "h-10 w-1 rounded-full transition-colors",
            dragging
              ? "bg-primary"
              : "bg-border group-hover/split:bg-primary/60 group-focus-visible/split:bg-primary",
          )}
        />
      </div>
      <aside
        ref={pane}
        style={{ width }}
        className={cn(
          "bg-card border-app-border view-in-side flex min-w-[300px] shrink-0 overflow-hidden rounded-[calc(var(--radius)*1.25)] border shadow-md max-md:hidden",
          dragging && "select-none",
        )}
      >
        <ChatView key={chatId} chatId={chatId} inApp />
      </aside>
    </>
  );
}

/** Why an app shows nothing: safe mode, it is off, or it has a problem. */
function AppUnavailable({ id, info }: { id: string; info?: ExtensionInfo }) {
  const t = useT();
  const customize = useChatStore((s) => s.customize);
  const [error, setError] = useState<string | null>(null);
  const ext = info ?? customize?.extensions.find((e) => e.id === id);
  if (!customize) return null;
  let text: string;
  let action: { label: string; run: () => Promise<unknown> } | null = null;
  if (customize.safeMode.on) {
    text = t("Safe mode is on ({reason}), so apps are off.", {
      reason: customize.safeMode.reason ?? "",
    });
    action = {
      label: t("Leave safe mode"),
      run: () => call(() => api.customize["safe-mode"].off.post()),
    };
  } else if (!ext) text = t("This app is not installed.");
  else if (ext.problem) text = t("This app cannot run: {problem}", { problem: ext.problem });
  else {
    text = t("This app is turned off.");
    action = {
      label: t("Turn on"),
      run: () => call(() => api.extensions({ extensionId: id }).enabled.post({ enabled: true })),
    };
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-muted-foreground max-w-sm text-sm">{text}</p>
      {action && (
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() =>
            void action
              .run()
              .then(() => loadCustomize())
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
          }
        >
          {action.label}
        </Button>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

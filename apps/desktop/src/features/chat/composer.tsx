import { addresseesOf, type ChatKind, type Message } from "@aura/shared";
import { CornerDownRight, SendHorizontal, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/features/localization/i18n";
import { cn } from "@/lib/utils";
import { reportError, sendMessage } from "./actions";
import { AgentMark } from "./agent-mark";
import { activeToken, matchAgents } from "./mentions";
import { displayName, previewOf } from "./message-utils";
import { agentName } from "./participants";
import { type AgentInfo, useChatStore } from "./store";

const ORCHESTRATOR = "orchestrator";

/**
 * A floating command bar: write markdown, reply to a message, and address agents. Typing `@` (or
 * `/` at the start) suggests the chat's agents; the line below shows who will answer (ADR 0014).
 */
export function Composer({
  chatId,
  topicId = null,
  closed = false,
  chatKind,
  replyTo,
  onCancelReply,
  placeholder,
}: {
  chatId: string;
  /** The topic messages go to (null: General). */
  topicId?: string | null;
  /** A closed topic is read-only. */
  closed?: boolean;
  chatKind: ChatKind;
  replyTo: Message | null;
  onCancelReply: () => void;
  placeholder?: string;
}) {
  const t = useT();
  const me = useChatStore((s) => s.me);
  const members = useChatStore((s) => s.members[chatId]);
  const directory = useChatStore((s) => s.agents);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuClosed, setMenuClosed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  const agentHandles = useMemo(
    () => (members ?? []).filter((m) => m.kind === "agent").map((m) => m.id),
    [members],
  );
  const agents = useMemo(
    () =>
      agentHandles.map(
        (handle): AgentInfo => directory[handle] ?? { handle, name: handle, role: "" },
      ),
    [agentHandles, directory],
  );

  const token = activeToken(text, caret);
  const suggestions = token && !menuClosed ? matchAgents(agents, token.query).slice(0, 8) : [];
  const menuOpen = suggestions.length > 0;
  const selected = Math.min(menuIndex, Math.max(0, suggestions.length - 1));

  const addressees = addresseesOf({
    body: text,
    chatKind,
    agentMembers: agentHandles,
    orchestrator: ORCHESTRATOR,
    replyTarget: replyTo?.author ?? null,
  });
  const answerers = answerersOf(addressees, directory, t);

  const pick = (agent: AgentInfo) => {
    if (!token) return;
    const insert = `@${agent.handle} `;
    const next = text.slice(0, token.start) + insert + text.slice(caret);
    const position = token.start + insert.length;
    setText(next);
    setMenuIndex(0);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(chatId, body, replyTo?.id ?? null, topicId);
      setText("");
      setCaret(0);
      onCancelReply();
    } catch (err) {
      reportError(err);
      setError(err instanceof Error ? err.message : "Could not send the message");
    } finally {
      setSending(false);
      ref.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setMenuIndex((selected + delta + suggestions.length) % suggestions.length);
        return;
      }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        const agent = suggestions[selected];
        if (agent) pick(agent);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuClosed(true);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
    if (event.key === "Escape" && replyTo) onCancelReply();
  };

  const updateCaret = () => setCaret(ref.current?.selectionStart ?? 0);

  if (closed)
    return (
      <p className="text-muted-foreground border-t px-6 py-4 text-center text-sm">
        {t("This topic is closed. Reopen it from its ⋯ menu above to write here.")}
      </p>
    );

  return (
    <div className="px-4 pt-2 pb-4 max-md:px-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="relative mx-auto max-w-3xl">
        {error && <p className="text-destructive mb-2 px-2 text-sm">{error}</p>}
        {menuOpen && (
          <div
            role="listbox"
            aria-label={t("Helpers")}
            className="bg-popover absolute right-0 bottom-full left-0 z-20 mb-2 overflow-hidden border p-1 shadow-md"
          >
            {suggestions.map((agent, index) => (
              <button
                key={agent.handle}
                type="button"
                role="option"
                aria-selected={index === selected}
                // Keep the textarea focused while choosing.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setMenuIndex(index)}
                onClick={() => pick(agent)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left",
                  index === selected && "bg-accent text-accent-foreground",
                )}
              >
                <AgentMark handle={agent.handle} size="sm" />
                <span className="text-sm font-medium">{agent.name}</span>
                <span className="kicker">@{agent.handle}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-right text-xs">
                  {agent.role}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="bg-input-bg border-input focus-within:border-ring min-w-0 flex-1 border transition-colors">
            {replyTo && (
              <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
                <CornerDownRight className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{displayName(replyTo.author, me)}</span>
                  <span className="text-muted-foreground ml-2 truncate">{previewOf(replyTo)}</span>
                </div>
                <button
                  type="button"
                  aria-label={t("Cancel reply")}
                  onClick={onCancelReply}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="flex items-end">
              <textarea
                ref={ref}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setCaret(e.target.selectionStart);
                  setMenuClosed(false);
                  setMenuIndex(0);
                }}
                onKeyDown={onKeyDown}
                onKeyUp={updateCaret}
                onClick={updateCaret}
                onBlur={() => setMenuClosed(true)}
                onFocus={() => setMenuClosed(false)}
                placeholder={placeholder ?? t("Write a message…")}
                rows={1}
                aria-autocomplete="list"
                className="placeholder:text-muted-foreground field-sizing-content max-h-48 min-h-[38px] flex-1 resize-none bg-transparent px-3 py-2 text-[14.5px] outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            aria-label={t("Send")}
            disabled={!text.trim() || sending}
            onClick={() => void send()}
            className="bg-primary text-primary-foreground hover:bg-primary-hover grid size-[38px] shrink-0 place-items-center transition-colors disabled:opacity-45"
          >
            <SendHorizontal className="size-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="text-muted-foreground mt-1.5 flex flex-wrap justify-between gap-x-4 px-0.5 text-xs">
          <span>
            {t("Answers:")} <span className="text-signal-text">{answerers}</span>
          </span>
          <span className="max-sm:hidden">{t("@ calls another helper")}</span>
        </div>
      </div>
    </div>
  );
}

/** Who will answer (ADR 0014), by name: the mentioned helpers, the one replied to, or the Helper. */
function answerersOf(
  { handles, via }: ReturnType<typeof addresseesOf>,
  names: Record<string, AgentInfo>,
  t: (text: string) => string,
): string {
  const name = (h: string) => agentName(h, names[h]?.name, t);
  if (handles.length === 0) return t("nobody: call a helper with @");
  if (via === "routed") return name(ORCHESTRATOR);
  return handles.map(name).join(", ");
}

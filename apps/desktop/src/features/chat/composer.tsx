import { addresseesOf, type ChatKind, type Message } from "@aura/shared";
import { ArrowUp, CornerDownRight, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Mark } from "@/components/mark";
import { cn } from "@/lib/utils";
import { reportError, sendMessage } from "./actions";
import { activeToken, matchAgents } from "./mentions";
import { displayName, previewOf } from "./message-utils";
import { type AgentInfo, useChatStore } from "./store";

const ORCHESTRATOR = "orchestrator";

/**
 * A floating command bar: write markdown, reply to a message, and address agents. Typing `@` (or
 * `/` at the start) suggests the chat's agents; the line below shows who will answer (ADR 0014).
 */
export function Composer({
  chatId,
  chatKind,
  replyTo,
  onCancelReply,
  placeholder,
}: {
  chatId: string;
  chatKind: ChatKind;
  replyTo: Message | null;
  onCancelReply: () => void;
  placeholder?: string;
}) {
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
      await sendMessage(chatId, body, replyTo?.id ?? null);
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

  return (
    <div className="px-4 pt-2 pb-4 max-md:px-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="relative mx-auto max-w-3xl">
        {error && <p className="text-destructive mb-2 px-2 text-sm">{error}</p>}
        {menuOpen && (
          <div
            role="listbox"
            aria-label="Agents"
            className="bg-popover absolute right-0 bottom-full left-0 z-20 mb-2 overflow-hidden rounded-2xl border p-1 shadow-lg"
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
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                  index === selected && "bg-accent",
                )}
              >
                <Mark
                  name={agent.handle}
                  kind={agent.handle === ORCHESTRATOR ? "orchestrator" : "agent"}
                  size="sm"
                />
                <span className="text-sm font-medium">{agent.name}</span>
                <span className="kicker">@{agent.handle}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-right text-xs">
                  {agent.role}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="bg-card focus-within:border-primary/60 focus-within:ring-primary/15 rounded-2xl border shadow-sm transition-shadow focus-within:ring-4">
          {replyTo && (
            <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
              <CornerDownRight className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{displayName(replyTo.author, me)}</span>
                <span className="text-muted-foreground ml-2 truncate">{previewOf(replyTo)}</span>
              </div>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={onCancelReply}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 p-2 pl-4">
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
              placeholder={placeholder ?? "Message · @ to call an agent"}
              rows={1}
              aria-autocomplete="list"
              className="placeholder:text-muted-foreground field-sizing-content max-h-48 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none"
            />
            <button
              type="button"
              aria-label="Send"
              disabled={!text.trim() || sending}
              onClick={() => void send()}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                text.trim()
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
        <div className="kicker mt-1.5 flex gap-4 px-1">
          {chatKind !== "direct" && (text.trim() || replyTo) ? (
            <span className="text-primary normal-case">{addresseeLine(addressees)}</span>
          ) : (
            <>
              <span className="max-md:hidden">⏎ send</span>
              <span className="max-md:hidden">⇧⏎ new line</span>
              <span>@ call an agent</span>
              <span className="max-md:hidden">reply to answer one</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function addresseeLine({ handles, via }: ReturnType<typeof addresseesOf>): string {
  if (handles.length === 0) return "Nobody will answer: mention an agent";
  const who = handles.map((h) => `@${h}`).join(", ");
  switch (via) {
    case "reply":
      return `→ ${who} (you are replying)`;
    case "routed":
      return "→ @orchestrator will pass it to the right agent";
    default:
      return `→ ${who}`;
  }
}

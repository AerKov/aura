import { GENERAL_TOPIC_TITLE, MAX_TOPIC_TITLE, type Topic } from "@aura/shared";
import { Check, Hash, Lock, MoreHorizontal, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { createTopic, openTopic, reportError, updateTopic } from "./actions";

const EMPTY: Topic[] = [];

/**
 * A chat's topics, like Telegram forum topics (ADR 0024): General plus the user's own. Each topic
 * shows only its messages, and agents in it see only those.
 */
export function TopicBar({
  chatId,
  topics = EMPTY,
  active,
}: {
  chatId: string;
  topics?: Topic[];
  active: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const chip = (id: string | null, title: string, closed = false) => (
    <div key={id ?? "general"} className="relative flex shrink-0 items-center">
      {renaming === id && id ? (
        <TitleInput
          initial={title}
          onDone={(next) => {
            setRenaming(null);
            if (next && next !== title)
              void updateTopic(chatId, id, { title: next }).catch(reportError);
          }}
        />
      ) : (
        <button
          type="button"
          aria-pressed={active === id}
          onClick={() => openTopic(chatId, id)}
          onContextMenu={(e) => {
            if (!id) return;
            e.preventDefault();
            setMenu(id);
          }}
          className={cn(
            "flex h-7 items-center gap-1 rounded-pill border px-2.5 text-xs whitespace-nowrap",
            active === id
              ? "border-primary bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {closed ? <Lock className="size-3" /> : id ? <Hash className="size-3" /> : null}
          {title}
        </button>
      )}
      {id && active === id && renaming !== id && (
        <button
          type="button"
          aria-label={`More for ${title}`}
          className="text-muted-foreground hover:text-foreground ml-0.5 rounded p-0.5"
          onClick={() => setMenu(menu === id ? null : id)}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      )}
      {menu === id && id && (
        <TopicMenu
          closed={closed}
          onClose={() => setMenu(null)}
          onRename={() => {
            setMenu(null);
            setRenaming(id);
          }}
          onToggle={() => {
            setMenu(null);
            void updateTopic(chatId, id, { closed: !closed }).catch(reportError);
          }}
        />
      )}
    </div>
  );

  return (
    <div className="bg-background flex items-center gap-1.5 overflow-x-auto border-b px-5 py-1.5 max-md:px-2">
      {chip(null, GENERAL_TOPIC_TITLE)}
      {topics.map((t) => chip(t.id, t.title, t.closed))}
      {adding ? (
        <TitleInput
          initial=""
          placeholder="New topic"
          onDone={(title) => {
            setAdding(false);
            if (title) void createTopic(chatId, title).catch(reportError);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-muted-foreground hover:bg-accent flex h-7 shrink-0 items-center gap-1 rounded-pill px-2 text-xs"
          title="A new topic: its messages stay in it, and agents there see only them"
        >
          <Plus className="size-3.5" /> Topic
        </button>
      )}
    </div>
  );
}

function TitleInput({
  initial,
  placeholder,
  onDone,
}: {
  initial: string;
  placeholder?: string;
  onDone: (title: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const finish = (save: boolean) => onDone(save ? value.trim() || null : null);
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <input
        ref={ref}
        aria-label={placeholder ?? "Topic title"}
        value={value}
        maxLength={MAX_TOPIC_TITLE}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") finish(false);
        }}
        className="bg-background h-7 w-36 rounded-pill border px-2.5 text-xs"
      />
      <button
        type="button"
        aria-label="Save"
        onClick={() => finish(true)}
        className="hover:bg-accent rounded p-1"
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => finish(false)}
        className="hover:bg-accent rounded p-1"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function TopicMenu({
  closed,
  onClose,
  onRename,
  onToggle,
}: {
  closed: boolean;
  onClose: () => void;
  onRename: () => void;
  onToggle: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);
  return (
    <div
      ref={box}
      className="bg-popover text-popover-foreground fixed z-30 mt-24 w-40 rounded-xl border p-1 text-sm shadow-lg"
    >
      <button
        type="button"
        className="hover:bg-accent w-full rounded-lg px-2 py-1.5 text-left"
        onClick={onRename}
      >
        Rename
      </button>
      <button
        type="button"
        className="hover:bg-accent w-full rounded-lg px-2 py-1.5 text-left"
        onClick={onToggle}
      >
        {closed ? "Reopen" : "Close (read-only)"}
      </button>
    </div>
  );
}

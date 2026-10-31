import {
  type ChatSummary,
  GENERAL_TOPIC_TITLE,
  type Message,
  type Topic,
  tileOf,
} from "@aura/shared";
import { ChevronLeft, PanelRight, ScrollText } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { tr, useT } from "@/features/localization/i18n";
import { useExtensionApps } from "@/features/shell/apps";
import { closeAppRef, openAppRef } from "@/features/shell/layout";
import {
  loadMembers,
  loadMessages,
  loadTopics,
  moveToTopic,
  reportError,
  showList,
} from "./actions";
import { AgentMark } from "./agent-mark";
import { BudgetButton } from "./budget";
import { ChatMark } from "./chat-mark";
import { Composer } from "./composer";
import { DeleteChatButton } from "./delete-chat";
import { MessageBubble } from "./message-bubble";
import { isGrouped } from "./message-utils";
import { agentName, chatTitle } from "./participants";
import { SetupPanel } from "./setup-panel";
import { getState, useChatStore } from "./store";
import { loadSummary, SummaryPanel } from "./summary-panel";
import { TeamButton } from "./team-button";
import { TopicBar } from "./topic-bar";

const EMPTY: Message[] = [];

const GREETING: Record<"direct" | "system" | "group", { title: string; text: string }> = {
  direct: {
    title: "What are we making?",
    text: "Talk an idea through with your Helper. When it is ready, it proposes a team and a budget for you to approve.",
  },
  system: {
    title: "All quiet",
    text: "Alerts from your monitoring tools and apps land here, and your Helper sorts them out.",
  },
  group: {
    title: "The team is getting ready",
    text: "Helpers post here as they work. Call one with @ to ask it something.",
  },
};

const SUBTITLE = {
  direct: "Your own chat with your main AI helper",
  group: "A project: helpers work on it together",
  chosen: "Your group: you and the helpers you chose",
  app: "An app's chat: change it by asking",
  system: "When something broke or needs attention",
} as const;

/**
 * A chat. `inApp`: shown as the panel inside its app's tile (ADR 0027), so without the back button
 * and the button that opens the app.
 */
export function ChatView({ chatId, inApp = false }: { chatId: string; inApp?: boolean }) {
  const chat = useChatStore((s) => s.chats[chatId]);
  const all = useChatStore((s) => s.messages[chatId] ?? EMPTY);
  const topics = useChatStore((s) => s.topics[chatId]);
  const topicId = useChatStore((s) => s.activeTopic[chatId] ?? null);
  const topic = topics?.find((t) => t.id === topicId) ?? null;
  // A topic shows only its own messages (ADR 0024).
  const messages = useMemo(() => all.filter((m) => m.topicId === topicId), [all, topicId]);
  const [moving, setMoving] = useState<Message | null>(null);
  const streaming = useChatStore((s) => s.streaming);
  const members = useChatStore((s) => s.members[chatId]);
  const project = useChatStore((s) => (chat?.projectId ? s.projects[chat.projectId] : undefined));
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [panel, setPanel] = useState<"summary" | null>(null);
  const [summary, setSummary] = useState<ChatSummary | null>(null);
  const apps = useExtensionApps();
  // The chat's app: the app itself (an app's chat) or the one pinned to its project. Never another
  // chat's or the first installed one (BUG-3).
  const ownApp = project?.kind === "app" ? project.id : (project?.app ?? null);
  const appId = ownApp && apps.some((a) => a.id === ownApp) ? ownApp : null;
  const appOpen = useChatStore((s) => (appId ? !!tileOf(s.layout, `ext:${appId}`) : false));
  const t = useT();
  const agentList = useChatStore((s) => s.agents);
  const agentNames = useMemo(
    () =>
      Object.fromEntries(
        Object.values(agentList).map((a) => [a.handle, agentName(a.handle, a.name, t)]),
      ),
    [agentList, t],
  );

  // Nothing opens by itself next to a chat (ADR 0027): the user opens the app when they want it.
  useEffect(() => {
    if (!getState().messages[chatId]) void loadMessages(chatId).catch(reportError);
  }, [chatId]);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    void loadMembers(chatId).catch(reportError);
  }, [chatId]);

  // The summary changes only after runs, so it is refreshed when an agent finishes a reply.
  const finished = messages.filter(
    (m) => m.author.kind === "agent" && m.status !== "streaming",
  ).length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh when a reply finished
  useEffect(() => {
    void loadSummary(chatId, topicId).then(setSummary).catch(reportError);
  }, [chatId, topicId, finished]);

  useEffect(() => {
    void loadTopics(chatId).catch(reportError);
  }, [chatId]);

  const working = messages.filter((m) => m.status === "streaming").map((m) => m.author.id);
  const byId = useMemo(() => new Map(all.map((m) => [m.id, m])), [all]);

  // Keep the view pinned to the newest message unless the user scrolled up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when content changes
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const jumpTo = (messageId: string) => {
    const el = document.getElementById(`m-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
  };

  if (!chat) return null;
  const helpers = (members ?? []).filter((m) => m.kind === "agent");
  const greeting = GREETING[chat.kind];

  return (
    <div className="relative flex min-w-0 flex-1">
      <section data-part="chat" className="chat-bg dot-grid flex min-w-0 flex-1 flex-col">
        {inApp ? (
          <header className="bg-card flex min-h-[52px] items-center gap-3 border-b px-3.5 py-2">
            <div className="min-w-0 flex-1 leading-tight">
              <h2 className="text-[17px]">{t("App chat")}</h2>
              <p className="text-muted-foreground truncate text-xs">
                {t("Working: {names}", {
                  names:
                    helpers
                      .filter((h) => h.id !== "orchestrator")
                      .map((h) => agentNames[h.id] ?? h.id)
                      .join(", ") || "—",
                })}
              </p>
            </div>
            <TeamButton chatId={chatId} />
          </header>
        ) : (
          <header className="bg-card flex min-h-[60px] items-center gap-3 border-b px-4 py-2.5 max-md:px-2">
            <button
              type="button"
              aria-label={t("Back to chats")}
              onClick={showList}
              className="text-muted-foreground @min-[640px]:hidden"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1 leading-tight">
              <h1 className="truncate text-xl">{chatTitle(chat, t)}</h1>
              <p className="text-muted-foreground truncate text-[12.5px]">
                {working.length > 0 ? (
                  <span className="text-signal-text">
                    {t("{name} is working…", {
                      name: working.map((h) => agentNames[h] ?? h).join(", "),
                    })}
                  </span>
                ) : (
                  t(
                    SUBTITLE[
                      chat.kind === "group"
                        ? appId
                          ? "app"
                          : project
                            ? "group"
                            : "chosen"
                        : chat.kind
                    ],
                  )
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {chat.kind === "group" && helpers.length > 0 && (
                <div
                  className="flex gap-1 @max-[560px]:hidden"
                  title={helpers.map((a) => agentNames[a.id] ?? a.id).join(", ")}
                >
                  {helpers.map((a) => (
                    <AgentMark
                      key={a.id}
                      handle={a.id}
                      size="xs"
                      working={working.includes(a.id)}
                    />
                  ))}
                </div>
              )}
              {chat.kind === "group" && <TeamButton chatId={chatId} />}
              {project && <BudgetButton project={project} />}
              {summary && (
                <Button
                  variant={panel === "summary" ? "secondary" : "ghost"}
                  size="sm"
                  title={t("What helpers keep of older messages")}
                  onClick={() => setPanel(panel === "summary" ? null : "summary")}
                >
                  <ScrollText /> <span className="@max-[560px]:hidden">{t("Summary")}</span>
                </Button>
              )}
              {chat.kind === "group" && !appId && (
                <DeleteChatButton chatId={chatId} project={Boolean(project)} />
              )}
              {appId && (
                <Button
                  variant={appOpen ? "secondary" : "outline"}
                  size="sm"
                  onClick={() =>
                    appOpen ? closeAppRef(`ext:${appId}`) : openAppRef(`ext:${appId}`, "right")
                  }
                >
                  <PanelRight />{" "}
                  <span className="@max-[560px]:hidden">
                    {appOpen ? t("Close the app") : t("Open the app")}
                  </span>
                </Button>
              )}
            </div>
          </header>
        )}
        <TopicBar chatId={chatId} topics={topics} active={topicId} />
        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-5 py-4 max-md:px-3"
        >
          <div className="mx-auto max-w-[760px] pb-4">
            {messages.length === 0 && (
              <div className="mx-auto mt-[12vh] max-w-sm text-center">
                <div className="mb-5 flex justify-center">
                  <ChatMark chat={chat} size="lg" />
                </div>
                <h2 className="mb-2 text-2xl">{t(greeting.title)}</h2>
                <p className="text-muted-foreground text-sm">{t(greeting.text)}</p>
              </div>
            )}
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                replyTarget={message.replyTo ? byId.get(message.replyTo) : undefined}
                showAuthor={!isGrouped(messages[index - 1], message)}
                onReply={setReplyTo}
                onJumpTo={jumpTo}
                onMove={topics && topics.length > 0 ? setMoving : undefined}
              />
            ))}
          </div>
        </div>
        {chat.kind === "direct" && <SetupPanel />}
        {moving && (
          <MoveDialog message={moving} topics={topics ?? []} onClose={() => setMoving(null)} />
        )}
        <Composer
          chatId={chatId}
          topicId={topicId}
          closed={topic?.closed ?? false}
          chatKind={chat.kind}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          placeholder={
            chat.kind === "direct"
              ? t("Write to {name}…", { name: agentNames.orchestrator ?? t("Helper") })
              : inApp
                ? t("Write what to change…")
                : undefined
          }
        />
      </section>
      {panel === "summary" && summary && (
        <SummaryPanel
          summary={summary}
          topicId={topicId}
          onCleared={() => {
            setSummary(null);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

/** Puts a message into another topic of its chat. */
function MoveDialog({
  message,
  topics,
  onClose,
}: {
  message: Message;
  topics: Topic[];
  onClose: () => void;
}) {
  const targets: { id: string | null; title: string }[] = [
    { id: null, title: GENERAL_TOPIC_TITLE },
    ...topics.filter((t) => !t.closed),
  ].filter((t) => t.id !== message.topicId);
  return (
    <div className="bg-popover text-popover-foreground mx-auto mb-2 w-full max-w-3xl rounded-xl border p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{tr("Move this message to")}</span>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {tr("Cancel")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {targets.map((t) => (
          <Button
            key={t.id ?? "general"}
            size="sm"
            variant="outline"
            className="rounded-pill"
            onClick={() => {
              onClose();
              void moveToTopic(message.id, t.id).catch(reportError);
            }}
          >
            {t.title}
          </Button>
        ))}
      </div>
    </div>
  );
}

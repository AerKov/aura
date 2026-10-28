import {
  type ChatSummary,
  GENERAL_TOPIC_TITLE,
  type Message,
  type Topic,
  tileOf,
} from "@aura/shared";
import { Box, ChevronLeft, ListTodo, Monitor, PanelRight, ScrollText } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
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
import { BudgetButton } from "./budget";
import { ChatMark } from "./chat-mark";
import { Composer } from "./composer";
import { IsolationPanel } from "./isolation-panel";
import { MessageBubble } from "./message-bubble";
import { isGrouped } from "./message-utils";
import { chatSubtitle } from "./participants";
import { SetupPanel } from "./setup-panel";
import { getState, useChatStore } from "./store";
import { loadSummary, SummaryPanel } from "./summary-panel";
import { TasksPanel } from "./tasks-panel";
import { TopicBar } from "./topic-bar";
import { WebhookInfo } from "./webhook-info";

const EMPTY: Message[] = [];

const GREETING: Record<"direct" | "system" | "group", { title: string; text: string }> = {
  direct: {
    title: "What are we making?",
    text: "Talk an idea through with the orchestrator. When it is ready, it proposes a team and a budget for you to approve.",
  },
  system: {
    title: "All quiet",
    text: "Alerts from your monitoring tools land here, and the orchestrator triages them.",
  },
  group: {
    title: "The team is getting ready",
    text: "Agents post here as they work. Mention one with @ to ask it something.",
  },
};

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
  const taskCount = useChatStore((s) =>
    chat?.projectId ? (s.tasks[chat.projectId]?.length ?? 0) : 0,
  );
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [panel, setPanel] = useState<"tasks" | "summary" | "isolation" | null>(null);
  const [summary, setSummary] = useState<ChatSummary | null>(null);
  const apps = useExtensionApps();
  // The app next to this chat: the project's own, else the first installed one.
  const appId = project?.app ?? apps[0]?.id ?? null;
  const appOpen = useChatStore((s) => (appId ? !!tileOf(s.layout, `ext:${appId}`) : false));

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
  const agents = (members ?? []).filter((m) => m.kind === "agent");
  const greeting = GREETING[chat.kind];

  return (
    <div className="relative flex min-w-0 flex-1">
      <section className="chat-bg dot-grid flex min-w-0 flex-1 flex-col">
        <header className="bg-background flex h-14 items-center gap-3 border-b px-5 max-md:px-2">
          {!inApp && (
            <button
              type="button"
              aria-label="Back to chats"
              onClick={showList}
              className="text-muted-foreground md:hidden"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <ChatMark chat={chat} size="md" working={working.length > 0} />
          <div className="min-w-0">
            <h1 className="truncate text-[17px] leading-tight font-semibold tracking-tight">
              {chat.title}
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              {working.length > 0 ? (
                <span className="text-primary font-mono text-xs">
                  ●{working.map((h) => `@${h}`).join(", ")} working…
                </span>
              ) : chat.kind === "group" && agents.length > 0 ? (
                `project · ${agents.filter((a) => a.id !== "orchestrator").length} agents`
              ) : (
                chatSubtitle(chat)
              )}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {chat.kind === "group" && agents.length > 0 && (
              <div
                className="flex -space-x-2 max-sm:hidden"
                title={agents.map((a) => `@${a.id}`).join(", ")}
              >
                {agents.map((a) => (
                  <Mark
                    key={a.id}
                    name={a.id}
                    kind={a.id === "orchestrator" ? "orchestrator" : "agent"}
                    size="sm"
                    working={working.includes(a.id)}
                    className="ring-background ring-2"
                  />
                ))}
              </div>
            )}
            {chat.kind === "system" && <WebhookInfo />}
            {project && <BudgetButton project={project} />}
            {summary && (
              <Button
                variant={panel === "summary" ? "secondary" : "ghost"}
                size="sm"
                title="What agents keep of older messages"
                onClick={() => setPanel(panel === "summary" ? null : "summary")}
              >
                <ScrollText /> <span className="max-sm:hidden">Summary</span>
              </Button>
            )}
            {project && (
              <Button
                variant={panel === "isolation" ? "secondary" : "ghost"}
                size="sm"
                title="Where this project's commands run"
                onClick={() => setPanel(panel === "isolation" ? null : "isolation")}
              >
                {project.isolation === "container" ? <Box /> : <Monitor />}
                <span className="max-sm:hidden">
                  {project.isolation === "container" ? "Container" : "Host"}
                </span>
              </Button>
            )}
            {project && (
              <Button
                variant={panel === "tasks" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPanel(panel === "tasks" ? null : "tasks")}
              >
                <ListTodo /> <span className="max-sm:hidden">Tasks</span>
                {taskCount ? ` ${taskCount}` : ""}
              </Button>
            )}
            {appId && !inApp && (
              <Button
                variant={appOpen ? "secondary" : "ghost"}
                size="sm"
                title={
                  appOpen ? "Close the app next to this chat" : "Open the app next to this chat"
                }
                onClick={() =>
                  appOpen ? closeAppRef(`ext:${appId}`) : openAppRef(`ext:${appId}`, "right")
                }
              >
                <PanelRight /> <span className="max-sm:hidden">Apps</span>
              </Button>
            )}
          </div>
        </header>
        <TopicBar chatId={chatId} topics={topics} active={topicId} />
        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-6 py-4 max-md:px-3"
        >
          <div className="mx-auto max-w-3xl pb-4">
            {messages.length === 0 && (
              <div className="mx-auto mt-[12vh] max-w-sm text-center">
                <div className="mb-5 flex justify-center">
                  <ChatMark chat={chat} size="lg" />
                </div>
                <h2 className="mb-2 text-2xl font-semibold tracking-tight">{greeting.title}</h2>
                <p className="text-muted-foreground text-sm">{greeting.text}</p>
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
          placeholder={chat.kind === "direct" ? "What do you have in mind?" : undefined}
        />
      </section>
      {panel === "tasks" && chat.projectId && (
        <TasksPanel projectId={chat.projectId} onClose={() => setPanel(null)} />
      )}
      {panel === "isolation" && project && (
        <IsolationPanel project={project} onClose={() => setPanel(null)} />
      )}
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
        <span className="font-medium">Move this message to</span>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {targets.map((t) => (
          <Button
            key={t.id ?? "general"}
            size="sm"
            variant="outline"
            className="rounded-full"
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

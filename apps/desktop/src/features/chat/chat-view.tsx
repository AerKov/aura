import type { ChatSummary, Message } from "@aura/shared";
import { tileOf } from "@aura/shared";
import { Box, ChevronLeft, ListTodo, Monitor, PanelRight, ScrollText } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { useExtensionApps } from "@/features/shell/apps";
import { closeAppRef, openBeside } from "@/features/shell/layout";
import { loadMembers, reportError, showList } from "./actions";
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
import { WebhookInfo } from "./webhook-info";

const EMPTY: Message[] = [];

/** Chats whose project app was opened this session; closing it then keeps it closed. */
const autoOpened = new Set<string>();

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

export function ChatView({ chatId }: { chatId: string }) {
  const chat = useChatStore((s) => s.chats[chatId]);
  const messages = useChatStore((s) => s.messages[chatId] ?? EMPTY);
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

  // A project's app opens by itself next to its chat, once per visit of the session.
  useEffect(() => {
    if (!project?.app || autoOpened.has(chatId)) return;
    autoOpened.add(chatId);
    if (!tileOf(getState().layout, `ext:${project.app}`)) openBeside(`ext:${project.app}`);
  }, [chatId, project?.app]);
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
    void loadSummary(chatId).then(setSummary).catch(reportError);
  }, [chatId, finished]);

  const working = messages.filter((m) => m.status === "streaming").map((m) => m.author.id);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

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
          <button
            type="button"
            aria-label="Back to chats"
            onClick={showList}
            className="text-muted-foreground md:hidden"
          >
            <ChevronLeft className="size-5" />
          </button>
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
            {appId && (
              <Button
                variant={appOpen ? "secondary" : "ghost"}
                size="sm"
                title={
                  appOpen ? "Close the app next to this chat" : "Open the app next to this chat"
                }
                onClick={() => (appOpen ? closeAppRef(`ext:${appId}`) : openBeside(`ext:${appId}`))}
              >
                <PanelRight /> <span className="max-sm:hidden">Apps</span>
              </Button>
            )}
          </div>
        </header>
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
              />
            ))}
          </div>
        </div>
        {chat.kind === "direct" && <SetupPanel />}
        <Composer
          chatId={chatId}
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

import type { Message, Participant } from "@crew/shared";

export const CONTEXT_WINDOW = 30;

function label(author: Participant, ownerName: string): string {
  if (author.kind === "user") return `${ownerName} (user)`;
  return `@${author.id}`;
}

/**
 * Builds the run prompt from the recent chat window. The trigger message is shown last and
 * explicitly, so the agent knows what to answer.
 */
export function buildPrompt(input: {
  agentHandle: string;
  chatTitle: string;
  history: Message[];
  trigger: Message;
  ownerName: string;
}): string {
  const byId = new Map(input.history.map((m) => [m.id, m]));
  const lines = input.history
    .filter((m) => m.id !== input.trigger.id && m.status !== "streaming" && m.kind !== "card")
    .slice(-CONTEXT_WINDOW)
    .map((m) => formatMessage(m, byId, input.ownerName));

  const trigger = formatMessage(input.trigger, byId, input.ownerName);
  return [
    `You are @${input.agentHandle} in the chat "${input.chatTitle}".`,
    lines.length > 0
      ? `<chat_history>\n${lines.join("\n\n")}\n</chat_history>`
      : "The chat is empty so far.",
    `<new_message>\n${trigger}\n</new_message>`,
    "Write your reply to the new message. Your reply is posted to the chat as is.",
  ].join("\n\n");
}

function formatMessage(m: Message, byId: Map<string, Message>, ownerName: string): string {
  const reply = m.replyTo ? byId.get(m.replyTo) : undefined;
  const replyNote = reply ? ` (replying to ${label(reply.author, ownerName)})` : "";
  return `[${label(m.author, ownerName)}${replyNote}]\n${m.body}`;
}

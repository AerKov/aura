import { addresseesOf, type Chat, type Message, type Participant } from "@aura/shared";

/** Why an agent was woken; the runtime words the agent's prompt accordingly. */
export type WakeReason = "direct" | "mention" | "reply" | "named" | "routed";

export interface Wake {
  handle: string;
  reason: WakeReason;
}

/**
 * Which agents a new message should wake up (docs/SPEC.md section 8, rule 1; ADR 0014).
 *
 * Agents wake each other only with @mentions (and task or alert cards). A message from the user is
 * always addressed to someone (`addresseesOf`): the agents it mentions, else the agent it replies
 * to, else an agent it names first, else the orchestrator, which answers or routes it.
 */
export function agentsToTrigger(input: {
  message: Message;
  chat: Chat;
  agentMembers: string[];
  orchestrator: string;
  /** Author of the message this one replies to, if any. */
  replyTarget?: Participant | null;
}): Wake[] {
  const { message, chat, agentMembers, orchestrator } = input;
  // Task cards wake the agents they mention (the assignee).
  const wakes =
    message.kind === "text" || (message.kind === "card" && message.card?.type === "task");
  if (message.status !== "final" || !wakes) return [];

  const author = message.author;
  if (author.kind !== "user") {
    // Agents and bots: mentions only, never themselves (loop guard, rule 8).
    return message.mentions
      .filter((h) => agentMembers.includes(h))
      .filter((h) => !(author.kind === "agent" && h === author.id))
      .map((handle) => ({ handle, reason: "mention" as const }));
  }

  const { handles, via } = addresseesOf({
    body: message.body,
    chatKind: chat.kind,
    agentMembers,
    orchestrator,
    replyTarget: input.replyTarget,
    mentions: message.mentions,
  });
  return handles.map((handle) => ({
    handle,
    reason: via === "direct" && handle !== orchestrator ? "mention" : via,
  }));
}

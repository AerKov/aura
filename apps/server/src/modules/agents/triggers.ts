import type { Chat, Message } from "@aura/shared";

/**
 * Which agents a new message should wake up (docs/SPEC.md section 8, rule 1): agents reply only
 * when @mentioned, except the orchestrator, which answers every user message in the direct chat.
 */
export function agentsToTrigger(input: {
  message: Message;
  chat: Chat;
  agentMembers: string[];
  orchestrator: string;
}): string[] {
  const { message, chat, agentMembers, orchestrator } = input;
  if (message.status !== "final" || message.kind !== "text") return [];

  const targets = new Set<string>();
  if (chat.kind === "direct" && message.author.kind === "user") targets.add(orchestrator);
  for (const handle of message.mentions) {
    if (agentMembers.includes(handle)) targets.add(handle);
  }
  // An agent never triggers itself.
  if (message.author.kind === "agent") targets.delete(message.author.id);
  return [...targets];
}

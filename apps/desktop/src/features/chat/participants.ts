import type { Chat, Participant } from "@aura/shared";

export function displayName(
  participant: Participant,
  me: { id: string; name: string } | null,
): string {
  if (participant.kind === "user") return participant.id === me?.id ? me.name : participant.id;
  if (participant.kind === "bot") {
    const [kind, source] = participant.id.split(":");
    return source
      ? `${source} ${kind}`
      : participant.id.charAt(0).toUpperCase() + participant.id.slice(1);
  }
  const name = participant.id.replace(/[-_]+/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatListTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return formatTime(iso);
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

/**
 * Plain names for the built-in chats and the orchestrator (ADR 0034): "Helper" and "Alerts" in
 * the interface's language, unless the user renamed them.
 */
export function chatTitle(chat: Chat, t: (text: string) => string): string {
  if (chat.kind === "direct" && chat.title === "Orchestrator") return t("Helper");
  return chat.title;
}

export function agentName(handle: string, name: string | undefined, t: (text: string) => string) {
  if (handle === "orchestrator" && (!name || name === "Orchestrator")) return t("Helper");
  return name ?? handle;
}

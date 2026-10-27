import type { Chat, Participant } from "@crew/shared";

export function displayName(
  participant: Participant,
  me: { id: string; name: string } | null,
): string {
  if (participant.kind === "user") return participant.id === me?.id ? me.name : participant.id;
  const name = participant.id.replace(/[-_]+/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const PALETTE = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-orange-500",
];

/** Stable avatar color for a name. */
export function colorFor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? "bg-sky-500";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function chatSubtitle(chat: Chat): string {
  if (chat.kind === "direct") return "your orchestrator";
  if (chat.kind === "system") return "alerts and system events";
  return "project";
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

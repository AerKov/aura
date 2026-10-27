import { type Message, previewText } from "@crew/shared";

export { displayName, formatTime } from "./participants";

export function previewOf(message: Message): string {
  return message.body
    ? previewText(message.body, 90)
    : message.card
      ? `[${message.card.type}]`
      : "";
}

/** Consecutive messages from the same author within 5 minutes are grouped. */
export function isGrouped(prev: Message | undefined, current: Message): boolean {
  if (!prev || prev.kind === "system") return false;
  return (
    prev.author.kind === current.author.kind &&
    prev.author.id === current.author.id &&
    new Date(current.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000
  );
}

/**
 * Wraps `@handle` mentions outside code in inline code-free emphasis so they stand out in
 * rendered markdown. Matches the rules of `parseMentions` in @aura/shared.
 */
export function highlightMentions(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
  return parts
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(/(^|[^\w@.*])@([a-zA-Z][\w-]{1,31})/g, "$1**@$2**"),
    )
    .join("");
}

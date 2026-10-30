export const MAX_CSS = 100_000;
export const ASSET_NAME_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;

/**
 * Makes agent-written CSS safe to inject: no `@import`, no remote `url()` (which could leak data or
 * load content), no legacy `expression()`. Inline `data:image/...` URLs are kept.
 */
export function sanitizeCss(css: string): string {
  return css
    .slice(0, MAX_CSS)
    .replace(/@import[^;]*;?/gi, "/* @import removed */")
    .replace(/url\(\s*(?!['"]?data:image\/)[^)]*\)/gi, "none")
    .replace(/expression\s*\(/gi, "/* expression removed */(")
    .replace(/<\/style/gi, "<\\/style");
}

import { code } from "@streamdown/code";
import { memo } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

const plugins = { code };

/**
 * Markdown used everywhere in chat: GFM, tables, Shiki code highlighting, safe links.
 * `streaming` renders partial markdown gracefully while a reply is still arriving.
 */
export const Markdown = memo(function Markdown({
  children,
  streaming = false,
}: {
  children: string;
  streaming?: boolean;
}) {
  return (
    <Streamdown
      className="markdown"
      plugins={plugins}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      shikiTheme={["github-light", "github-dark"]}
    >
      {children}
    </Streamdown>
  );
});

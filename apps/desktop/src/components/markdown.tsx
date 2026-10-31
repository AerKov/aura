import { code } from "@streamdown/code";
import { ImageIcon } from "lucide-react";
import { memo } from "react";
import { type Components, Streamdown } from "streamdown";
import { tr } from "@/features/localization/i18n";
import "streamdown/styles.css";

const plugins = { code };

/**
 * Images inside a message are shown only when they are part of it (`data:`). A remote image is a
 * link the user may open: loading it by itself would let text an agent was tricked into writing (a
 * web page, an alert) send data to any server in the image's address.
 */
function SafeImage(props: { src?: unknown; alt?: unknown }) {
  const href = typeof props.src === "string" ? props.src : "";
  const alt = typeof props.alt === "string" ? props.alt : "";
  if (href.startsWith("data:image/")) return <img src={href} alt={alt} />;
  if (!/^https?:\/\//i.test(href)) return <span>{alt}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1"
    >
      <ImageIcon className="size-3.5" /> {alt || tr("Image")} ({new URL(href).host})
    </a>
  );
}

// Streamdown's map has an index signature that no single typed component fits; img gets img props.
const components = { img: SafeImage } as unknown as Components;

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
      components={components}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      shikiTheme={["github-light", "github-dark"]}
    >
      {children}
    </Streamdown>
  );
});

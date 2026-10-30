import { createContext, type ReactNode, useContext } from "react";
import { useT } from "@/features/localization/i18n";

/** Pages shown as a tab of Settings (ADR 0039) get a smaller header: the tab already names them. */
export const EmbeddedPage = createContext(false);

/** Header for the built-in apps' pages; the title is translated (ADR 0034). */
export function PageHeader({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const t = useT();
  const embedded = useContext(EmbeddedPage);
  if (embedded)
    return children ? (
      <p className="text-muted-foreground mb-5 max-w-2xl text-sm">{children}</p>
    ) : null;
  return (
    <header className="mb-6">
      <h1 className="flex items-center gap-2.5 text-[26px] [&_svg]:size-6 [&_svg]:stroke-[1.5]">
        {icon}
        {t(title)}
      </h1>
      {children && <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{children}</p>}
    </header>
  );
}

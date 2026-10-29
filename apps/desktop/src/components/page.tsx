import type { ReactNode } from "react";
import { useT } from "@/features/localization/i18n";

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

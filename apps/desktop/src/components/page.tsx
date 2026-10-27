import type { ReactNode } from "react";

/** Header for full-page views (skills, schedule, customize, devices). */
export function PageHeader({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="mb-8">
      <h1 className="font-display flex items-center gap-3 text-3xl font-semibold tracking-tight">
        {icon}
        {title}
      </h1>
      {children && <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{children}</p>}
    </header>
  );
}

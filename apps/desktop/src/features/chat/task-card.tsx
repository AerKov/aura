import type { TaskCard as TaskCardData, TaskStatus } from "@aura/shared";
import { CheckCircle2, Circle, CircleDashed, CircleSlash } from "lucide-react";
import { cn } from "@/lib/utils";

export const TASK_STATUS: Record<
  TaskStatus,
  { label: string; icon: typeof Circle; className: string }
> = {
  todo: { label: "To do", icon: Circle, className: "text-muted-foreground" },
  doing: { label: "In progress", icon: CircleDashed, className: "text-sky-600 dark:text-sky-400" },
  done: { label: "Done", icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  blocked: { label: "Blocked", icon: CircleSlash, className: "text-rose-600 dark:text-rose-400" },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { label, icon: Icon, className } = TASK_STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", className)}>
      <Icon className="size-3.5" /> {label}
    </span>
  );
}

export function TaskCard({ card }: { card: TaskCardData }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border bg-black/[0.03] px-2 py-1.5 text-xs dark:bg-white/[0.04]">
      <TaskStatusBadge status={card.status} />
      <span className="text-muted-foreground ml-auto">→ @{card.assignee}</span>
    </div>
  );
}

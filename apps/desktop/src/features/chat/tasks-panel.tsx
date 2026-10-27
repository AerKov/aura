import type { Task, TaskStatus } from "@aura/shared";
import { X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { loadTasks, reportError, setTaskStatus } from "./actions";
import { useChatStore } from "./store";
import { TASK_STATUS } from "./task-card";

const EMPTY: Task[] = [];
const ORDER: TaskStatus[] = ["doing", "todo", "blocked", "done"];

export function TasksPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const tasks = useChatStore((s) => s.tasks[projectId] ?? EMPTY);

  useEffect(() => {
    void loadTasks(projectId).catch(reportError);
  }, [projectId]);

  return (
    <aside className="bg-background flex w-80 shrink-0 flex-col border-l max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="font-semibold">Tasks</h2>
        <Button variant="ghost" size="icon" aria-label="Close tasks" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {tasks.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No tasks yet. Agents create them as they plan.
          </p>
        )}
        {ORDER.map((status) => {
          const group = tasks.filter((t) => t.status === status);
          if (group.length === 0) return null;
          const { label, icon: Icon, className } = TASK_STATUS[status];
          return (
            <section key={status}>
              <h3
                className={`mb-1 flex items-center gap-1 text-xs font-semibold uppercase ${className}`}
              >
                <Icon className="size-3.5" /> {label} · {group.length}
              </h3>
              <ul className="space-y-1.5">
                {group.map((task) => (
                  <li key={task.id} className="rounded-lg border p-2 text-sm">
                    <div className="font-medium">{task.title}</div>
                    {task.note && (
                      <div className="text-muted-foreground mt-0.5 text-xs">{task.note}</div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">@{task.assignee}</span>
                      <select
                        aria-label="Task status"
                        value={task.status}
                        onChange={(e) =>
                          void setTaskStatus(task.id, e.target.value as TaskStatus).catch(
                            reportError,
                          )
                        }
                        className="bg-background rounded border px-1 py-0.5"
                      >
                        {ORDER.map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS[s].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

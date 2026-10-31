import type { Job } from "@aura/shared";
import { CalendarClock, Pause, Play, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { useChatStore } from "@/features/chat/store";
import { tr } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
}

/** Scheduled jobs: created by the orchestrator with approval; paused, resumed or removed here. */
export function JobsView() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const chats = useChatStore((s) => s.chats);

  const load = useCallback(async () => setJobs(await call(() => api.jobs.get())), []);
  useEffect(() => {
    void load().catch(reportError);
    const timer = setInterval(() => void load().catch(reportError), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title={tr("Reminders")}
          icon={<CalendarClock className="text-primary size-7" />}
        >
          {tr(
            "Recurring jobs wake an agent with a prompt. Ask the orchestrator to create one; you approve it.",
          )}
        </PageHeader>
        {jobs?.length === 0 && (
          <p className="text-muted-foreground text-sm">{tr("No jobs yet.")}</p>
        )}
        <ul className="space-y-3">
          {jobs?.map((job) => (
            <li key={job.id} className="rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <span className="font-medium">{job.name}</span>
                <code className="bg-muted rounded px-1.5 text-xs">{job.schedule}</code>
                <span
                  className={
                    job.status === "active"
                      ? "text-xs text-success"
                      : "text-muted-foreground text-xs"
                  }
                >
                  {job.status}
                </span>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void act(() =>
                        call(() =>
                          api
                            .jobs({ jobId: job.id })
                            .patch({ status: job.status === "active" ? "paused" : "active" }),
                        ),
                      )
                    }
                  >
                    {job.status === "active" ? <Pause /> : <Play />}
                    {job.status === "active" ? tr("Pause") : tr("Resume")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void act(() => call(() => api.jobs({ jobId: job.id }).delete()))}
                  >
                    <Trash2 /> {tr("Delete")}
                  </Button>
                </div>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                @{job.agent} {tr("in")} {chats[job.chatId]?.title ?? job.chatId} {tr("· next")}{" "}
                {when(job.nextRunAt)} {tr("· last")} {when(job.lastRunAt)}
              </p>
              <p className="mt-2 text-sm whitespace-pre-wrap">{job.prompt}</p>
              {job.lastError && <p className="text-destructive mt-1 text-xs">{job.lastError}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import { ArchiveRestore, History, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { loadInitial, loadProjects, reportError } from "@/features/chat/actions";
import { loadCustomize } from "@/features/customize/state";
import { tr, useT } from "@/features/localization/i18n";
import { openAppRef } from "@/features/shell/layout";
import { api, call } from "@/lib/api";

type Backup = Awaited<ReturnType<typeof loadBackups>>[number];
const loadBackups = () => call(() => api["app-backups"].get());

const size = (bytes: number) =>
  bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.ceil(bytes / 1000)} KB`;
const when = (iso: string) => new Date(iso).toLocaleString();

/** After a restore everything may differ: settings, apps, their chats. */
async function reloadAll(): Promise<void> {
  await loadCustomize();
  await Promise.all([loadProjects(), loadInitial()]);
}

/** History (ADR 0042): bring back uninstalled apps. An app's own versions live beside the app. */
export function BackupsView() {
  const t = useT();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBackups(await loadBackups());
  }, []);
  useEffect(() => {
    load().catch(reportError);
  }, [load]);

  const run = async (key: string, action: () => Promise<string | null>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const bringBack = (b: Backup) =>
    run(b.name, async () => {
      const { id } = await call(() => api["app-backups"]({ name: b.name }).restore.post());
      await reloadAll();
      openAppRef(`ext:${id}`);
      return t("{name} is back, with a new chat.", { name: b.appName });
    });
  const removeBackup = (b: Backup) =>
    run(`del:${b.name}`, async () => {
      await call(() => api["app-backups"]({ name: b.name }).delete());
      return null;
    });

  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-3xl">
        <PageHeader title={tr("History")} icon={<History className="text-primary size-7" />}>
          {t(
            "Every change to an app is a version you can go back to, from the app itself. Apps you uninstall wait here.",
          )}
        </PageHeader>

        {notice && <p className="mb-4 text-sm">{notice}</p>}
        {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

        <h2 className="kicker mb-1 flex items-center gap-1.5">
          <ArchiveRestore className="size-3.5" /> {t("Uninstalled apps")}
        </h2>
        <p className="text-muted-foreground mb-3 text-xs">
          {t(
            "An app you uninstall leaves a backup here: its code with its versions, its data and its chat as text. Bringing it back gives it a new chat.",
          )}
        </p>
        {backups.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("None.")}</p>
        ) : (
          <ul className="bg-card divide-y rounded-2xl border">
            {backups.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{b.appName}</div>
                  <div className="text-muted-foreground text-xs">
                    {t("uninstalled {when}", { when: when(b.removedAt) })} · {size(b.size)}
                    {b.taken && ` · ${t("an app with its id exists now")}`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-pill"
                  disabled={busy !== null || b.taken}
                  onClick={() => void bringBack(b)}
                >
                  {busy === b.name ? <RefreshCw className="animate-spin" /> : <ArchiveRestore />}{" "}
                  {t("Bring back")}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("Delete the backup of {name}", { name: b.appName })}
                  disabled={busy !== null}
                  onClick={() => void removeBackup(b)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

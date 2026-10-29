import { ArchiveRestore, History, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { loadInitial, loadProjects, reportError } from "@/features/chat/actions";
import { loadCustomize } from "@/features/customize/customize-view";
import { useT } from "@/features/localization/i18n";
import { openAppRef } from "@/features/shell/layout";
import { api, call } from "@/lib/api";

type Point = Awaited<ReturnType<typeof loadPoints>>[number];
type Backup = Awaited<ReturnType<typeof loadBackups>>[number];
const loadPoints = () => call(() => api["restore-points"].get());
const loadBackups = () => call(() => api["app-backups"].get());

const size = (bytes: number) =>
  bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.ceil(bytes / 1000)} KB`;
const when = (iso: string) => new Date(iso).toLocaleString();

/** After a restore everything may differ: settings, apps, their chats. */
async function reloadAll(): Promise<void> {
  await loadCustomize();
  await Promise.all([loadProjects(), loadInitial()]);
}

/**
 * Restore points (ADR 0033): take the whole Aura back or forward (configuration, apps with their
 * code and data, settings; not chats, memory or secrets), and bring back uninstalled apps.
 */
export function BackupsView() {
  const t = useT();
  const [points, setPoints] = useState<Point[] | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, b] = await Promise.all([loadPoints(), loadBackups()]);
    setPoints(p);
    setBackups(b);
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
      setConfirm(null);
    }
  };

  const create = () =>
    run("create", async () => {
      const point = await call(() => api["restore-points"].post({ label: label.trim() }));
      setLabel("");
      return t("Saved “{label}”.", { label: point.label });
    });
  const restore = (p: Point) =>
    run(p.id, async () => {
      const result = await call(() => api["restore-points"]({ id: p.id }).restore.post());
      await reloadAll();
      return t("Aura is at “{label}” now. What it was before is saved as “{saved}”.", {
        label: result.restored.label,
        saved: result.saved.label,
      });
    });
  const removePoint = (p: Point) =>
    run(`del:${p.id}`, async () => {
      await call(() => api["restore-points"]({ id: p.id }).delete());
      return null;
    });
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
        <PageHeader title="Backups" icon={<History className="text-primary size-7" />}>
          {t(
            "A restore point keeps the whole Aura as it was: agents, skills, themes, tool servers, settings, and every app with its code, versions and data. Chats, memory and secrets stay as they are. Going to a point saves the present first, so you can come back forward.",
          )}
        </PageHeader>

        <div className="bg-card mb-6 flex flex-wrap gap-2 rounded-2xl border p-4">
          <input
            aria-label={t("Name of the restore point")}
            placeholder={t("Name, e.g. Before the new dashboard")}
            value={label}
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            className="bg-background min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm"
          />
          <Button
            size="sm"
            className="rounded-pill"
            disabled={busy !== null}
            onClick={() => void create()}
          >
            {busy === "create" ? <RefreshCw className="animate-spin" /> : <Plus />}{" "}
            {t("Save the present")}
          </Button>
        </div>
        {notice && <p className="mb-4 text-sm">{notice}</p>}
        {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

        {points === null ? null : points.length === 0 ? (
          <p className="text-muted-foreground mb-8 text-sm">
            {t("No restore points yet. The orchestrator also saves one before bigger changes.")}
          </p>
        ) : (
          <ul className="bg-card mb-8 divide-y rounded-2xl border">
            {points.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {p.label}
                    {p.auto && (
                      <span className="text-muted-foreground ml-2 text-[11px] font-normal">
                        {t("automatic")}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {when(p.createdAt)} · {t("apps: {list}", { list: p.apps.join(", ") || "—" })} ·{" "}
                    {size(p.size)}
                  </div>
                </div>
                {confirm === p.id ? (
                  <span className="flex items-center gap-1.5 text-xs">
                    {t("Go there? The present is saved first.")}
                    <Button size="sm" disabled={busy !== null} onClick={() => void restore(p)}>
                      {busy === p.id ? <RefreshCw className="animate-spin" /> : <RotateCcw />}{" "}
                      {t("Go")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                      {t("Cancel")}
                    </Button>
                  </span>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-pill"
                      disabled={busy !== null}
                      onClick={() => setConfirm(p.id)}
                    >
                      <RotateCcw /> {t("Go to this point")}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("Delete “{label}”", { label: p.label })}
                      disabled={busy !== null}
                      onClick={() => void removePoint(p)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

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

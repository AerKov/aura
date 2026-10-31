import type { ExtensionInfo } from "@aura/shared";
import { MoreHorizontal, Power, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadInitial, loadProjects } from "@/features/chat/actions";
import { loadCustomize } from "@/features/customize/state";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { leaveApp } from "./view";

/**
 * An app's menu (ADR 0033): turn it off or on, or uninstall it. An app built in Aura leaves a backup (Settings → History
 * brings it back); a plain extension is removed as a commit of the data folder.
 */
export function AppMenu({ extension }: { extension: ExtensionInfo }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirm(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  /** Off: the app does not run and keeps its data; on again: as it was. */
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await call(() =>
        api.extensions({ extensionId: extension.id }).enabled.post({ enabled: !extension.enabled }),
      );
      await loadCustomize();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const uninstall = async () => {
    setBusy(true);
    setError(null);
    try {
      if (extension.app) await call(() => api.apps({ appId: extension.id }).delete());
      else await call(() => api.extensions({ extensionId: extension.id }).delete());
      leaveApp(extension.id);
      await loadCustomize();
      if (extension.app) await Promise.all([loadProjects(), loadInitial()]);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={t("More for {name}", { name: extension.name })}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-8 place-items-center rounded-full"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="bg-popover absolute top-10 right-0 z-30 w-64 rounded-2xl border p-2 text-sm shadow-lg">
          {confirm ? (
            <div className="p-1">
              <p className="mb-2 text-xs">
                {extension.app
                  ? t(
                      "Uninstall {name}? Its chat goes too. A copy of its code, versions and data is kept in History.",
                      { name: extension.name },
                    )
                  : t("Remove {name}? Its files go as a commit of the data folder.", {
                      name: extension.name,
                    })}
              </p>
              {error && <p className="text-destructive mb-2 text-xs">{error}</p>}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void uninstall()}
                >
                  {t("Uninstall")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  {t("Cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle()}
                className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2 py-1.5"
              >
                <Power className="size-4" /> {extension.enabled ? t("Turn off") : t("Turn on")}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(true)}
                className="hover:bg-accent text-destructive flex w-full items-center gap-2 rounded-lg px-2 py-1.5"
              >
                <Trash2 className="size-4" /> {t("Uninstall…")}
              </button>
              {error && <p className="text-destructive px-2 pt-1 text-xs">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

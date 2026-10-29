import type { ExtensionInfo } from "@aura/shared";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadInitial, loadProjects } from "@/features/chat/actions";
import { loadCustomize } from "@/features/customize/customize-view";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";

/**
 * An app's menu in the launcher (ADR 0033): uninstall it. An app built in Aura leaves a backup
 * (Restore points brings it back); a plain extension is removed as a commit of the data folder.
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

  const uninstall = async () => {
    setBusy(true);
    setError(null);
    try {
      if (extension.app) await call(() => api.apps({ appId: extension.id }).delete());
      else await call(() => api.extensions({ extensionId: extension.id }).delete());
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
        className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1 opacity-60 group-hover:opacity-100"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="bg-popover absolute top-7 right-0 z-10 w-64 rounded-xl border p-2 text-sm shadow-lg">
          {confirm ? (
            <div className="p-1">
              <p className="mb-2 text-xs">
                {extension.app
                  ? t(
                      "Uninstall {name}? Its chat goes too. A backup of its code, versions and data is kept under Restore points.",
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
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="hover:bg-accent text-destructive flex w-full items-center gap-2 rounded-lg px-2 py-1.5"
            >
              <Trash2 className="size-4" /> {t("Uninstall…")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

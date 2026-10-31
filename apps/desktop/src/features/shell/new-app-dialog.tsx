import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuraLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { loadInitial, loadProjects } from "@/features/chat/actions";
import { setState, useChatStore } from "@/features/chat/store";
import { loadCustomize } from "@/features/customize/state";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { openApp } from "./view";

const close = () => setState(() => ({ addOpen: false }));

/**
 * "New app" (ADR 0042): a name and what it should do. The app opens with its chat beside it,
 * where @builder starts making it.
 */
export function NewAppDialog() {
  const open = useChatStore((s) => s.addOpen);
  const t = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await call(() =>
        api.apps.post({ name: name.trim(), description: description.trim() || undefined }),
      );
      // The new app and its chat may not have arrived over the socket yet.
      await loadCustomize();
      await Promise.all([loadProjects(), loadInitial()]);
      close();
      setName("");
      setDescription("");
      openApp(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("Close")}
        tabIndex={-1}
        className="animate-in fade-in absolute inset-0 bg-black/30 duration-200"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("New app")}
        data-part="menu"
        className="bg-menu text-menu-foreground animate-in fade-in zoom-in-[0.97] relative w-[min(480px,100%)] overflow-hidden rounded-[calc(var(--radius)*1.5)] border shadow-lg duration-200 ease-[var(--ease)]"
      >
        <div className="aura-band h-1.5" aria-hidden />
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <AuraLogo alive className="size-11 shadow-md" />
            <div className="mr-auto">
              <h2 className="text-xl">{t("New app")}</h2>
              <p className="text-muted-foreground text-sm">
                {t("Describe it, and a helper builds it")}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full"
              aria-label={t("Close")}
              onClick={close}
            >
              <X />
            </Button>
          </div>
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground font-medium">{t("Name")}</span>
            <input
              ref={first}
              value={name}
              maxLength={60}
              placeholder={t("e.g. Warehouse")}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && void create()}
              className="bg-input-bg border-input focus-visible:border-ring focus-visible:ring-ring/20 h-11 rounded-xl border px-3.5 text-[15px] transition-shadow outline-none focus-visible:ring-4"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-xs">
            <label htmlFor="new-app-what" className="text-muted-foreground font-medium">
              {t("What it should do")}
            </label>
            <Textarea
              id="new-app-what"
              value={description}
              rows={4}
              className="rounded-xl px-3.5 py-2.5 text-[14px]"
              placeholder={t("e.g. keep what is in stock and remind me when something runs out")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" className="rounded-full" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button
              className="aura-button rounded-full px-5"
              disabled={busy || !name.trim()}
              onClick={() => void create()}
            >
              {busy ? t("Creating…") : t("Create")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

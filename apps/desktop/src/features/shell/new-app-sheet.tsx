import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { loadInitial, loadProjects } from "@/features/chat/actions";
import { useChatStore } from "@/features/chat/store";
import { loadCustomize } from "@/features/customize/customize-view";
import { useT } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { setAppChat } from "./app-controls";
import { closeMenus } from "./launcher";
import { openAppRef } from "./layout";

/**
 * "New app" (ADR 0024, ADR 0039): a sheet on the right, over the tiles. A name and what it should
 * do; @builder makes it in its chat, which opens with the new app.
 */
export function NewAppSheet() {
  const open = useChatStore((s) => s.addOpen);
  const t = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const appId = (
        await call(() =>
          api.apps.post({ name: name.trim(), description: description.trim() || undefined }),
        )
      ).id;
      setAppChat(appId, true);
      // The new app and its chat may not have arrived over the socket yet.
      await loadCustomize();
      await Promise.all([loadProjects(), loadInitial()]);
      closeMenus();
      setName("");
      setDescription("");
      openAppRef(`ext:${appId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label={t("Close")}
        tabIndex={-1}
        className="bg-background/45 flex-1"
        onClick={closeMenus}
      />
      <aside
        aria-label={t("New app")}
        className="bg-popover text-popover-foreground flex h-full w-[min(420px,100%)] flex-col border-l shadow-md"
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="mr-auto text-2xl">{t("New app")}</h2>
          <Button size="icon" variant="ghost" aria-label={t("Close")} onClick={closeMenus}>
            <X />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <p className="text-muted-foreground text-sm">
            {t("Describe it, and a helper builds it")}
          </p>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-foreground/70">{t("Name")}</span>
            <input
              value={name}
              maxLength={60}
              placeholder={t("e.g. Warehouse")}
              onChange={(e) => setName(e.target.value)}
              className="bg-input-bg border-input focus-visible:border-ring h-9 border px-2.5 text-sm outline-none"
            />
          </label>
          <div className="flex flex-col gap-1 text-xs">
            <label htmlFor="new-app-what" className="text-foreground/70">
              {t("What it should do")}
            </label>
            <Textarea
              id="new-app-what"
              value={description}
              rows={4}
              placeholder={t("e.g. keep what is in stock and remind me when something runs out")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <div className="flex gap-2 border-t p-4">
          <Button disabled={busy || !name.trim()} onClick={() => void create()}>
            {t("Create")}
          </Button>
        </div>
      </aside>
    </div>
  );
}

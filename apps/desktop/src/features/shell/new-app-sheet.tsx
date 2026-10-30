import type { PackSummary } from "@aura/shared";
import { Box, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { loadInitial, loadProjects, reportError } from "@/features/chat/actions";
import { useChatStore } from "@/features/chat/store";
import { loadCustomize } from "@/features/customize/customize-view";
import { useT } from "@/features/localization/i18n";
import { openSettings } from "@/features/settings/open";
import { api, call } from "@/lib/api";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { setAppChat } from "./app-controls";
import { useModules } from "./apps";
import { closeMenus } from "./launcher";
import { openAppRef } from "./layout";

/**
 * "New app" (ADR 0024, ADR 0034): a sheet on the right, over the tiles. A template from the
 * catalog, or your own: a name and what it should do, which @builder makes in its chat (that needs
 * Chats). The new app opens with its chat.
 */
export function NewAppSheet() {
  const open = useChatStore((s) => s.addOpen);
  const chats = useModules().chats;
  const t = useT();
  const [templates, setTemplates] = useState<PackSummary[]>([]);
  const [template, setTemplate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    call(() => api.catalog.get())
      .then((packs) => {
        const apps = packs.filter((p) => p.contents.apps.length === 1 && !p.installed);
        setTemplates(apps);
        setTemplate((current) => current ?? (chats ? null : (apps[0]?.id ?? null)));
      })
      .catch(reportError);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, chats]);

  if (!open) return null;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      let appId: string;
      const pack = templates.find((p) => p.id === template);
      if (pack) {
        const preview = await call(() => api.catalog.preview.post({ id: pack.id }));
        await call(() => api.catalog.install.post({ id: pack.id, sha256: preview.sha256 }));
        appId = pack.contents.apps[0] ?? "";
      } else {
        appId = (
          await call(() =>
            api.apps.post({ name: name.trim(), description: description.trim() || undefined }),
          )
        ).id;
        setAppChat(appId, true);
      }
      // The new app and its chat may not have arrived over the socket yet.
      await loadCustomize();
      if (chats) await Promise.all([loadProjects(), loadInitial()]);
      closeMenus();
      setName("");
      setDescription("");
      setTemplate(null);
      openAppRef(`ext:${appId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const choices = [
    ...templates.map((p) => ({
      id: p.id as string | null,
      name: p.name,
      text: p.description,
      icon: extensionIcon(null),
    })),
    ...(chats
      ? [
          {
            id: null,
            name: t("Your own"),
            text: t("Describe it, and a helper builds it"),
            icon: Box,
          },
        ]
      : []),
  ];
  const own = template === null && chats;

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
          <div className="grid grid-cols-2 gap-2">
            {choices.map((c) => {
              const Icon = c.icon;
              const on = template === c.id;
              return (
                <button
                  key={c.id ?? "own"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTemplate(c.id)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 border p-3 text-left transition-colors duration-150",
                    on
                      ? "border-ring bg-accent text-accent-foreground"
                      : "hover:bg-foreground/[0.06]",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.5} />
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="text-muted-foreground line-clamp-2 text-xs">{c.text}</span>
                </button>
              );
            })}
          </div>
          {own && (
            <>
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
                  placeholder={t(
                    "e.g. keep what is in stock and remind me when something runs out",
                  )}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </>
          )}
          {!chats && templates.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {t("No templates left to add. Turn on Chats to build your own app with agents.")}
            </p>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <div className="flex gap-2 border-t p-4">
          <Button
            disabled={busy || (own ? !name.trim() : template === null)}
            onClick={() => void create()}
          >
            {t("Create")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              closeMenus();
              openSettings("data");
            }}
          >
            {t("Browse the catalog")}
          </Button>
        </div>
      </aside>
    </div>
  );
}

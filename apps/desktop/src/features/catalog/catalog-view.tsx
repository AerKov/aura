import type { PackPreview, PackSummary } from "@aura/shared";
import { Check, Download, Link2, Package, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

const inputClass =
  "bg-background focus:border-primary/60 focus:ring-primary/15 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-4";

type Ref = { id: string } | { url: string };

/**
 * Ready-made packs of agents, skills, themes and extensions (ADR 0016). Nothing is written before the
 * user has seen every file and diff; the install sends back the hash of what was shown.
 */
export function CatalogView() {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState<{ key: string; ref: Ref; preview: PackPreview } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ key: string; text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setPacks(await call(() => api.catalog.get()));
    } catch (error) {
      reportError(error);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const preview = async (key: string, ref: Ref) => {
    setBusy(key);
    setStatus(null);
    try {
      const data = await call(() => api.catalog.preview.post(ref));
      setOpen({ key, ref, preview: data });
    } catch (error) {
      setStatus({ key, text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setBusy(null);
    }
  };

  const install = async () => {
    if (!open) return;
    setBusy(open.key);
    try {
      const { result } = await call(() =>
        api.catalog.install.post({ ...open.ref, sha256: open.preview.sha256 }),
      );
      setStatus({ key: open.key, text: result });
      setOpen(null);
      await load();
    } catch (error) {
      setStatus({
        key: open.key,
        text: error instanceof Error ? error.message : String(error),
        error: true,
      });
    } finally {
      setBusy(null);
    }
  };

  const panel = (key: string) =>
    open?.key === key ? (
      <PreviewPanel
        preview={open.preview}
        busy={busy === key}
        onInstall={() => void install()}
        onCancel={() => setOpen(null)}
      />
    ) : status?.key === key ? (
      <p
        className={cn(
          "mt-3 flex items-start gap-1.5 text-[13px]",
          status.error ? "text-destructive" : "text-primary",
        )}
      >
        {status.error ? (
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        ) : (
          <Check className="mt-0.5 size-4 shrink-0" />
        )}
        {status.text}
      </p>
    ) : null;

  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Catalog" icon={<Package className="text-primary size-7" />}>
          Ready-made teams, skills, themes and panels. You see every file before anything is
          installed, and each install is one commit in your data folder, so you can revert it. You
          can also ask the orchestrator: "set me up with a dev team".
        </PageHeader>

        <div className="bg-card mb-6 rounded-2xl border p-4">
          <div className="mb-1 text-sm font-medium">Install from a link</div>
          <p className="text-muted-foreground mb-3 text-[13px]">
            A GitHub repository or folder with a <code className="font-mono">pack.json</code>, or a
            direct https link to one. Read what it adds before you install it.
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void preview("url", { url: url.trim() });
            }}
          >
            <label className="relative min-w-60 flex-1">
              <Link2 className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                className={cn(inputClass, "w-full pl-9 font-mono text-[13px]")}
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <Button
              type="submit"
              variant="outline"
              className="h-auto rounded-full"
              disabled={!url.trim() || busy === "url"}
            >
              {busy === "url" ? <RefreshCw className="animate-spin" /> : null} Preview
            </Button>
          </form>
          {panel("url")}
        </div>

        {packs === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <ul className="grid gap-3">
            {packs.map((pack) => (
              <li key={pack.id} className="bg-card rounded-2xl border p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{pack.name}</span>
                      <span className="kicker">{pack.version}</span>
                      {pack.installed && (
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px]">
                          {pack.installed.version === pack.version
                            ? "installed"
                            : `installed ${pack.installed.version}`}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-1 text-[13px]">{pack.description}</p>
                    <Contents pack={pack} />
                  </div>
                  <Button
                    variant={pack.installed ? "outline" : "default"}
                    className="h-auto shrink-0 rounded-full"
                    disabled={busy === pack.id || open?.key === pack.id}
                    onClick={() => void preview(pack.id, { id: pack.id })}
                  >
                    {busy === pack.id ? <RefreshCw className="animate-spin" /> : <Download />}
                    {pack.installed?.version === pack.version
                      ? "Reinstall"
                      : pack.installed
                        ? "Update"
                        : "Install"}
                  </Button>
                </div>
                {panel(pack.id)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Contents({ pack }: { pack: PackSummary }) {
  const c = pack.contents;
  const chips = [
    ...c.agents.map((a) => `@${a}`),
    ...c.skills.map((s) => `skill ${s}`),
    ...c.themes.map((t) => `theme ${t}`),
    ...c.snippets.map((s) => `snippet ${s}`),
    ...c.extensions.map((e) => `panel ${e}`),
    ...c.apps.map((a) => `app ${a}`),
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span key={chip} className="bg-muted rounded-full px-2 py-0.5 font-mono text-[11px]">
          {chip}
        </span>
      ))}
    </div>
  );
}

function PreviewPanel({
  preview,
  busy,
  onInstall,
  onCancel,
}: {
  preview: PackPreview;
  busy: boolean;
  onInstall: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="bg-background mt-4 rounded-xl border p-4">
      <div className="max-h-96 overflow-y-auto text-[13px]">
        <Markdown>{preview.preview}</Markdown>
      </div>
      {preview.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[13px]">
          {preview.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              {w}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button className="h-auto rounded-full" disabled={busy} onClick={onInstall}>
          {busy ? <RefreshCw className="animate-spin" /> : <Check />} Install these files
        </Button>
        <Button variant="ghost" className="h-auto rounded-full" onClick={onCancel}>
          <X /> Cancel
        </Button>
        <span className="kicker ml-auto" title={preview.sha256}>
          sha256 {preview.sha256.slice(0, 12)}
        </span>
      </div>
    </div>
  );
}

import { previewKind } from "@aura/shared";
import { Download, Minus, Plus, Printer, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type FileView, setState, useChatStore } from "@/features/chat/store";
import { useT } from "@/features/localization/i18n";
import { saveBlob } from "@/lib/files";
import { openPdf, pageRatio, pagesForPrint, renderPage } from "./pdf";
import { printImages, printText } from "./print";

/**
 * The window that shows a file over the screen (ADR 0036): a PDF drawn page by page, an image or
 * text, with Print and Save. Chats and apps both open it; other types are only saved.
 */
export function FileViewer() {
  const view = useChatStore((s) => s.viewer);
  if (!view) return null;
  return (
    <ViewerWindow key={view.name} view={view} onClose={() => setState(() => ({ viewer: null }))} />
  );
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

function ViewerWindow({ view, onClose }: { view: FileView; onClose: () => void }) {
  const t = useT();
  const kind = previewKind(view.type);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    view
      .load()
      .then(async (b) => {
        if (!alive) return;
        setBlob(b);
        if (kind === "text") setText(await b.text());
        if (kind === "pdf") setDoc(await openPdf(b));
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [view, kind]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const imageUrl = useBlobUrl(kind === "image" ? blob : null);

  const print = async () => {
    setBusy(true);
    try {
      if (kind === "pdf" && doc) await printImages(await pagesForPrint(doc));
      else if (kind === "image" && imageUrl) await printImages([imageUrl]);
      else if (kind === "text") await printText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ready = blob !== null && (kind !== "pdf" || doc !== null);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("Close")}
        className="absolute inset-0 cursor-default bg-background/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={view.name}
        className="bg-background relative flex h-[min(92vh,1100px)] w-[min(1000px,96vw)] flex-col border shadow-lg"
      >
        <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium" title={view.name}>
            {view.name}
          </h2>
          {kind === "pdf" && doc && (
            <span className="text-muted-foreground font-mono text-xs max-sm:hidden">
              {t("{n} pages", { n: doc.numPages })}
            </span>
          )}
          {kind === "pdf" && (
            <div className="flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={t("Zoom out")}
                disabled={zoom === 0}
                onClick={() => setZoom(Math.max(0, zoom - 1))}
              >
                <Minus />
              </Button>
              <span className="w-10 text-center font-mono text-xs">
                {Math.round((ZOOMS[zoom] ?? 1) * 100)}%
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={t("Zoom in")}
                disabled={zoom === ZOOMS.length - 1}
                onClick={() => setZoom(Math.min(ZOOMS.length - 1, zoom + 1))}
              >
                <Plus />
              </Button>
            </div>
          )}
          {kind !== "none" && (
            <Button
              size="sm"
              variant="outline"
              disabled={!ready || busy}
              onClick={() => void print()}
            >
              <Printer /> <span className="max-sm:sr-only">{t("Print")}</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!blob}
            onClick={() => blob && saveBlob(blob, view.name)}
          >
            <Download /> <span className="max-sm:sr-only">{t("Save")}</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t("Close")}
            onClick={onClose}
          >
            <X />
          </Button>
        </header>
        <div className="bg-muted/50 min-h-0 flex-1 overflow-auto p-4 max-sm:p-2">
          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : !ready ? (
            <p className="text-muted-foreground text-sm">{t("Loading…")}</p>
          ) : kind === "pdf" && doc ? (
            <PdfPages doc={doc} scale={ZOOMS[zoom] ?? 1} />
          ) : kind === "image" && imageUrl ? (
            <img src={imageUrl} alt={view.name} className="mx-auto max-w-full border bg-paper" />
          ) : kind === "text" ? (
            <pre className="bg-background mx-auto max-w-4xl overflow-auto border p-4 font-mono text-[13px] whitespace-pre-wrap">
              {text}
            </pre>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t(
                "This kind of file cannot be shown here. Save it to open it with another program.",
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** An object URL for a blob, released when it changes. */
function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);
  return url;
}

/** All pages of a PDF in a column; a page is drawn when it comes near the screen. */
function PdfPages({ doc, scale }: { doc: PDFDocumentProxy; scale: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(200, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  return (
    <div ref={holder} className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-3">
      {width > 0 &&
        pages.map((n) => (
          <PdfPage key={n} doc={doc} number={n} width={Math.round(width * scale)} />
        ))}
    </div>
  );
}

function PdfPage({ doc, number, width }: { doc: PDFDocumentProxy; number: number; width: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(Math.SQRT2);
  const [near, setNear] = useState(number <= 2);
  useEffect(() => {
    let alive = true;
    pageRatio(doc, number).then((r) => alive && setRatio(r));
    return () => {
      alive = false;
    };
  }, [doc, number]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setNear(true),
      {
        rootMargin: "600px",
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!near || !el) return;
    // A fresh canvas each time: a canvas cannot be drawn on by two renders at once.
    const canvas = document.createElement("canvas");
    const job = renderPage(doc, number, width, canvas);
    job.done.then(() => el.replaceChildren(canvas)).catch(() => undefined);
    return job.cancel;
  }, [doc, number, width, near]);
  return (
    <div
      ref={box}
      className="shrink-0 border bg-paper shadow-sm"
      style={{ width, minHeight: Math.round(width * ratio) }}
    />
  );
}

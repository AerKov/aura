import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

/**
 * pdf.js (ADR 0036): pages are drawn on canvases, so a PDF looks and prints the same on every
 * system. The legacy build runs on the older web views Tauri uses on macOS and Linux. Fonts are
 * drawn as shapes (no FontFace) so the strict CSP stays as it is.
 */
const assets = (name: string) => `${import.meta.env.BASE_URL}pdfjs/${name}/`;

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    standardFontDataUrl: assets("standard_fonts"),
    wasmUrl: assets("wasm"),
    iccUrl: assets("iccs"),
    disableFontFace: true,
  }).promise;
}

/** A page being drawn on `canvas`, `width` css pixels wide (sharp on dense screens). */
export function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  width: number,
  canvas: HTMLCanvasElement,
): { done: Promise<void>; cancel: () => void } {
  let cancelled = false;
  let task: RenderTask | null = null;
  const done = (async () => {
    const page = await doc.getPage(pageNumber);
    if (cancelled) return;
    const base = page.getViewport({ scale: 1 });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    task = page.render({ canvas, viewport });
    try {
      await task.promise;
    } catch (error) {
      if (!cancelled) throw error;
    }
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/** A page's size relative to its width, to hold its place before it is drawn. */
export async function pageRatio(doc: PDFDocumentProxy, pageNumber: number): Promise<number> {
  const view = (await doc.getPage(pageNumber)).getViewport({ scale: 1 });
  return view.height / view.width;
}

/** Every page as a JPEG picture for the printer, one after another to spare memory. */
export async function pagesForPrint(doc: PDFDocumentProxy): Promise<string[]> {
  const out: string[] = [];
  const canvas = document.createElement("canvas");
  for (let n = 1; n <= doc.numPages; n++) {
    await renderPage(doc, n, 1100, canvas).done;
    out.push(canvas.toDataURL("image/jpeg", 0.92));
  }
  return out;
}

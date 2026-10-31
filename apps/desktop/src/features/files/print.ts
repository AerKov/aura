/**
 * Prints pictures or text through the system's print dialog: they are put in a block that is the
 * only thing visible on paper (see `#aura-print` in index.css), then removed.
 */
export function printBlock(fill: (root: HTMLElement) => void): Promise<void> {
  return new Promise((resolve) => {
    document.getElementById("aura-print")?.remove();
    const root = document.createElement("div");
    root.id = "aura-print";
    fill(root);
    document.body.append(root);
    const done = () => {
      window.removeEventListener("afterprint", done);
      root.remove();
      resolve();
    };
    window.addEventListener("afterprint", done);
    // Let the pictures decode before the dialog takes a snapshot of the page.
    const images = [...root.querySelectorAll("img")];
    Promise.all(images.map((img) => img.decode().catch(() => undefined))).then(() => {
      window.print();
      // Some web views never fire afterprint: clean up anyway after a while.
      setTimeout(done, 60_000);
    });
  });
}

export function printImages(urls: string[]): Promise<void> {
  return printBlock((root) => {
    for (const url of urls) {
      const img = document.createElement("img");
      img.src = url;
      root.append(img);
    }
  });
}

export function printText(text: string): Promise<void> {
  return printBlock((root) => {
    const pre = document.createElement("pre");
    pre.textContent = text;
    root.append(pre);
  });
}

/**
 * A page made by an app (an invoice as HTML) is shown and printed with no scripts and no network:
 * its own styles and inline pictures only. The policy is put before the page, so it rules it.
 */
export function inertHtml(html: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:">${html}`;
}

/** Prints a page through the system dialog, from a frame that runs none of its scripts. */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    // Same origin so the dialog can be opened on it; no allow-scripts, so the page runs nothing.
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.srcdoc = inertHtml(html);
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.remove();
        reject(new Error("The page could not be prepared for printing"));
        return;
      }
      const done = () => {
        frame.remove();
        resolve();
      };
      win.addEventListener("afterprint", done);
      win.focus();
      win.print();
      // Some web views never fire afterprint: clean up anyway after a while.
      setTimeout(done, 60_000);
    };
    document.body.append(frame);
  });
}

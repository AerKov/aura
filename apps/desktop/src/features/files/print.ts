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

// Retakes the screenshots in docs/assets from the demo instance (scripts/demo.ts).
//
//   bun scripts/demo.ts                          # terminal 1: sample content on :4517
//   bun run --cwd apps/desktop dev:vite          # terminal 2: the web client on :1420
//   node scripts/screenshots.cjs docs/assets     # terminal 3
//
// Needs Playwright with a browser; it is not a dependency of this repository.
const { chromium } = require("playwright");
const out = process.argv[2] ?? "docs/assets";
const URL = "http://localhost:1420/";
const wait = (p, ms = 900) => p.waitForTimeout(ms);

/** A fresh window that opens on `view` (the shell remembers it in localStorage). */
async function fresh(b, scheme, view, size = { width: 1600, height: 900 }) {
  const ctx = await b.newContext({ viewport: size, colorScheme: scheme, locale: "en-US" });
  // The app frames are sandboxed without storage: only the shell remembers the view.
  await ctx.addInitScript((v) => {
    try {
      localStorage.setItem("aura.view", JSON.stringify(v));
    } catch {}
  }, view);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", String(e)));
  await p.goto(URL);
  await wait(p, 3500);
  return { ctx, p };
}

(async () => {
  const b = await chromium.launch();
  for (const scheme of ["light", "dark"]) {
    const app = await fresh(b, scheme, { kind: "app", id: "clients" });
    await app.p.screenshot({ path: `${out}/shell-${scheme}.png` });
    await app.ctx.close();
    const helper = await fresh(b, scheme, { kind: "helper" });
    await helper.p.screenshot({ path: `${out}/helper-${scheme}.png` });
    await helper.ctx.close();
  }
  {
    const { ctx, p } = await fresh(b, "light", { kind: "helper" });
    await p.getByRole("button", { name: "New app" }).first().click();
    await wait(p, 900);
    await p.screenshot({ path: `${out}/new-app.png` });
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh(b, "light", { kind: "settings", tab: "ai" });
    await p.screenshot({ path: `${out}/settings.png` });
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh(b, "light", { kind: "app", id: "invoices" });
    await p.screenshot({ path: `${out}/invoices.png` });
    await ctx.close();
  }
  await b.close();
})();

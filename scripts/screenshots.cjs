// Retakes the screenshots in docs/assets from the demo instance (scripts/demo.ts).
//
//   bun scripts/demo.ts                          # terminal 1: sample content on :4517
//   bun run --cwd apps/desktop dev:vite          # terminal 2: the web client on :1420
//   node scripts/screenshots.cjs docs/assets     # terminal 3
//
// Needs Playwright with a browser; it is not a dependency of this repository. The files are named
// `screen-*.png`; give a redesign new names, since GitHub caches images by their address.
const { chromium } = require("playwright");
const out = process.argv[2] ?? "docs/assets";
const URL = "http://localhost:1420/";
const wait = (p, ms = 900) => p.waitForTimeout(ms);

/** A fresh window that opens on `view` (the shell remembers it in localStorage). */
async function fresh(
  b,
  scheme,
  view,
  { folded = false, size = { width: 1600, height: 900 } } = {},
) {
  const ctx = await b.newContext({ viewport: size, colorScheme: scheme, locale: "en-US" });
  // The app frames are sandboxed without storage: only the shell remembers the view.
  await ctx.addInitScript(
    ([v, f]) => {
      try {
        localStorage.setItem("aura.view", JSON.stringify(v));
        localStorage.setItem("aura.navFolded", f ? "1" : "0");
      } catch {}
    },
    [view, folded],
  );
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", String(e)));
  await p.goto(URL);
  await wait(p, 3500);
  return { ctx, p };
}

async function shot(b, name, scheme, view, opts, act) {
  const { ctx, p } = await fresh(b, scheme, view, opts);
  if (act) await act(p);
  await p.screenshot({ path: `${out}/screen-${name}.png` });
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  for (const scheme of ["light", "dark"]) {
    await shot(b, `app-${scheme}`, scheme, { kind: "app", id: "clients" });
    await shot(b, `helper-${scheme}`, scheme, { kind: "helper" });
  }
  await shot(b, "folded", "dark", { kind: "app", id: "clients" }, { folded: true });
  await shot(b, "new-app", "light", { kind: "helper" }, {}, async (p) => {
    await p.getByRole("button", { name: "New app" }).first().click();
    await wait(p);
  });
  await shot(b, "settings", "light", { kind: "settings", tab: "ai" });
  await shot(b, "viewer", "light", { kind: "app", id: "invoices" }, {}, async (p) => {
    await p.frameLocator("iframe").getByRole("button", { name: "View" }).first().click();
    await wait(p, 2500);
  });
  await b.close();
})();

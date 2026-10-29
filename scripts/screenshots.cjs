// Retakes the screenshots in docs/assets from the demo instance (scripts/demo.ts).
//
//   bun scripts/demo.ts                          # terminal 1: sample content on :4517
//   bun run --cwd apps/desktop dev:vite          # terminal 2: the web client on :1420
//   node scripts/screenshots.cjs docs/assets     # terminal 3
//
// Needs Playwright with a browser (`bun add -g playwright`, `playwright install chromium`); it is not
// a dependency of this repository. Run it against a fresh demo: it sets the screen's layout.
const { chromium } = require("playwright");
const out = process.argv[2] ?? "docs/assets";
const URL = "http://localhost:1420/",
  API = "http://127.0.0.1:4517";
const wait = (p, ms = 900) => p.waitForTimeout(ms);
const tile = (id, app) => ({ kind: "tile", id, app });
const SINGLE = (app) => ({ root: tile("t1", app), focused: "t1" });
const PAIR = (a, b) => ({
  root: {
    kind: "split",
    id: "s1",
    dir: "row",
    sizes: [50, 50],
    children: [tile("t1", a), tile("t2", b)],
  },
  focused: "t2",
});
async function setLayout(layout) {
  const { token } = await (
    await fetch(`${API}/session/local`, {
      method: "POST",
      headers: { origin: "http://localhost:1420" },
    })
  ).json();
  const r = await fetch(`${API}/layout`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(layout),
  });
  if (!r.ok) throw new Error(`layout ${r.status}${await r.text()}`);
}
async function fresh(b, scheme, layout, size = { width: 1600, height: 900 }) {
  await setLayout(layout);
  const ctx = await b.newContext({ viewport: size, colorScheme: scheme, locale: "en-US" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", String(e)));
  await p.goto(URL);
  await wait(p, 3500);
  return { ctx, p };
}
const row = (p, name) =>
  p.locator('aside[aria-label="Chats"]').getByText(name, { exact: true }).first();
(async () => {
  const b = await chromium.launch();
  for (const scheme of ["light", "dark"]) {
    const { ctx, p } = await fresh(b, scheme, PAIR("messenger", "ext:clients"));
    await row(p, "Clients").click();
    await wait(p, 1500);
    await p.screenshot({ path: `${out}/shell-${scheme}.png` });
    if (scheme === "light") {
      await p.getByRole("button", { name: "My apps" }).first().click();
      await wait(p, 900);
      await p.screenshot({ path: `${out}/my-apps.png` });
    }
    await ctx.close();
  }
  {
    // the app with its own chat beside it
    const { ctx, p } = await fresh(b, "light", SINGLE("ext:clients"));
    await p.getByRole("button", { name: "Chat", exact: true }).click();
    await wait(p, 1500);
    await p.screenshot({ path: `${out}/app-chat.png` });
    await ctx.close();
  }
  {
    // one wide tile
    const { ctx, p } = await fresh(b, "light", SINGLE("messenger"));
    await row(p, "Landing page").click();
    await wait(p, 1500);
    await p.screenshot({ path: `${out}/project.png` });
    await p
      .locator('aside[aria-label="Chats"]')
      .getByRole("button", { name: /^Alerts/ })
      .click();
    await wait(p, 1500);
    await p.screenshot({ path: `${out}/alerts.png` });
    await ctx.close();
  }
  {
    const { ctx, p } = await fresh(b, "light", SINGLE("page:agents"));
    await wait(p, 1500);
    await p.screenshot({ path: `${out}/helpers.png` });
    await ctx.close();
  }
  {
    // phone
    const { ctx, p } = await fresh(b, "light", SINGLE("messenger"), { width: 390, height: 844 });
    await p.screenshot({ path: `${out}/phone-list.png` });
    await row(p, "Helper")
      .click()
      .catch((e) => console.log("phone row", String(e).slice(0, 80)));
    await wait(p, 1500);
    await p.screenshot({ path: `${out}/phone-chat.png` });
    await ctx.close();
  }
  await b.close();
})();

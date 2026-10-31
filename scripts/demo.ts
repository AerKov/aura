/**
 * A demo instance with sample content, for screenshots and for looking around without setting
 * anything up: a full server on an in-memory database and a temporary data folder, with a few
 * chats, an app with data and a waiting decision. Nothing here talks to a model.
 *
 *   bun scripts/demo.ts                 # listens on 127.0.0.1:4517
 *   bun run --cwd apps/desktop dev:vite # the web client on http://localhost:1420
 *
 * Do not run it next to a real `bun run dev` server: both want port 4517.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIRECT_CHAT_ID } from "../apps/server/src/modules/chats/chat/repo";
import { createTestApp } from "../apps/server/src/testing";

/** A one-page PDF with a few lines of text, written by hand: no library needed. */
function tinyPdf(lines: string[]): Uint8Array {
  const text = lines
    .map(
      (line, i) =>
        `BT /F1 ${i === 0 ? 22 : 14} Tf 60 ${760 - i * 34} Td (${line.replace(/[()\\]/g, "")}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const PORT = Number(process.env.AURA_PORT ?? 4517);
const read = (name: string) => readFileSync(join(import.meta.dir, "demo", name), "utf8");

const t = await createTestApp({ fileAgents: true, welcome: false });
// AURA_DEMO_NO_AI=1 shows the first-run screen: no AI is connected yet.
if (process.env.AURA_DEMO_NO_AI)
  (t.provider as unknown as { status: unknown }).status = {
    ok: false,
    reason: "Claude Code was not found on this computer.",
  };
const user = { kind: "user" as const, id: "owner" };
const agent = (id: string) => ({ kind: "agent" as const, id });
const say = (chatId: string, author: ReturnType<typeof agent> | typeof user, body: string) =>
  t.repo.createMessage({ chatId, author, body });

// An app with data, as if @builder had made it.
await t.apps.create({
  name: "Clients",
  id: "clients",
  files: { "manifest.json": read("clients.manifest.json"), "main.js": read("clients.main.js") },
});
const clients = [
  ["Anna Kovalenko", "Lumen Studio", "anna@lumen.example", "active"],
  ["Mark Davies", "Northwind", "mark@northwind.example", "lead"],
  ["Olena Shevchuk", "Brick & Co", "olena@brick.example", "active"],
  ["Tomas Weber", "Fjord Labs", "tomas@fjord.example", "past"],
  ["Sofia Rossi", "Verde", "sofia@verde.example", "lead"],
];
for (const [name, company, email, status] of clients)
  await t.appData.insert("clients", "clients", { name, company, email, status });
const deals = [
  ["Website redesign", "Anna Kovalenko", 4200, "proposal"],
  ["Brand guidelines", "Olena Shevchuk", 2800, "won"],
  ["Landing page", "Mark Davies", 1500, "lead"],
  ["Packaging", "Sofia Rossi", 3100, "lead"],
  ["Annual retainer", "Anna Kovalenko", 9600, "won"],
  ["Pitch deck", "Tomas Weber", 900, "lost"],
];
for (const [title, client, amount, stage] of deals)
  await t.appData.insert("clients", "deals", { title, client, amount, stage });

// An app that keeps PDF files (the `docs` permission, ADR 0036), with one invoice in it.
await t.apps.create({
  name: "Invoices",
  id: "invoices",
  files: { "manifest.json": read("invoices.manifest.json"), "main.js": read("invoices.main.js") },
});
t.files.put(
  { kind: "app", id: "invoices" },
  "Invoice 2026-014.pdf",
  tinyPdf(["Invoice 2026-014", "Lumen Studio: website redesign", "Total: 4 200 EUR"]),
);
// Apps often make documents as HTML: the viewer draws them as pages, without their scripts.
t.files.put(
  { kind: "app", id: "invoices" },
  "Invoice 2026-015.html",
  new TextEncoder().encode(
    '<html><head><style>body{font-family:sans-serif;padding:32px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}</style></head><body><h1>Invoice 2026-015</h1><p>Northwind · landing page</p><table><tr><th>Item</th><th>Sum</th></tr><tr><td>Landing page</td><td>1 500 EUR</td></tr></table><p><b>Total: 1 500 EUR</b></p><script>document.body.innerHTML="scripts ran"</script></body></html>',
  ),
);

// The chat with the Helper.
await say(
  DIRECT_CHAT_ID,
  user,
  "I run a small design studio. Keep track of my clients and deals, please.",
);
await say(
  DIRECT_CHAT_ID,
  agent("orchestrator"),
  "Done: I made an app called **Clients** with a client list and a board of deals by stage. It is in the list on the left; its chat is right beside it, so you can change it any time.",
);

// The app's own chat: a change waiting for a decision.
const appChat = (await t.projects.get("clients"))?.chatId ?? "";
await say(appChat, user, "Add an email column to the clients table and a button to export to CSV.");
const run = await t.repo.createMessage({
  chatId: appChat,
  author: agent("builder"),
  body: "Both are ready to look at: the table has the column and the button sits above it. Nothing changes until you say yes.",
  card: {
    type: "run",
    agent: "builder",
    status: "done",
    tools: [
      { name: "Read", summary: "manifest.json", isError: false },
      { name: "Read", summary: "main.js", isError: false },
      { name: "Edit", summary: "main.js", isError: false },
    ],
    usage: null,
    error: null,
    commit: null,
  },
});
await t.repo.updateMessage(run.id, {
  usage: { inputTokens: 3100, outputTokens: 640, costUsd: 0.04 },
});
const approval = await t.approvals.request({
  kind: "app_change",
  requestedBy: "builder",
  chatId: appChat,
  title: "Change the app Clients",
  why: "You asked for an email column and a CSV export.",
  preview:
    '```diff\n+ columns: [{ field: "name" }, { field: "company" }, { field: "email" }]\n+ ctx.kit.button(el, { label: "Export to CSV" })\n```',
  changes: ["A new Email column in the clients table", "An “Export to CSV” button above it"],
  payload: { app: "clients" },
});
void approval;

t.app.listen({ hostname: "127.0.0.1", port: PORT });
console.log(`Aura demo on http://127.0.0.1:${PORT} (open the web client on http://localhost:1420)`);

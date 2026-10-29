/**
 * A demo instance with sample content, for screenshots and for looking around without setting
 * anything up: a full server on an in-memory database and a temporary data folder, with a few
 * chats, an app with data, a waiting decision and an alert. Nothing here talks to a model.
 *
 *   bun scripts/demo.ts                 # listens on 127.0.0.1:4517
 *   bun run --cwd apps/desktop dev:vite # the web client on http://localhost:1420
 *
 * Do not run it next to a real `bun run dev` server: both want port 4517.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIRECT_CHAT_ID, SYSTEM_CHAT_ID } from "../apps/server/src/modules/chat/repo";
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
const user = { kind: "user" as const, id: "owner" };
const agent = (id: string) => ({ kind: "agent" as const, id });
const say = (chatId: string, author: ReturnType<typeof agent> | typeof user, body: string) =>
  t.repo.createMessage({ chatId, author, body });

// A team from the catalog: @coder and @reviewer.
const pack = await t.catalog.preview({ id: "dev-team" });
await t.catalog.install({ id: "dev-team" }, pack.sha256);

// An app with data, as if @builder had made it.
await t.apps.installFromPack(
  "clients",
  { "manifest.json": read("clients.manifest.json"), "main.js": read("clients.main.js") },
  { id: "clients", version: "1.0.0" },
);
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
await t.apps.installFromPack(
  "invoices",
  { "manifest.json": read("invoices.manifest.json"), "main.js": read("invoices.main.js") },
  { id: "invoices", version: "1.0.0" },
);
t.files.put(
  { kind: "app", id: "invoices" },
  "Invoice 2026-014.pdf",
  tinyPdf(["Invoice 2026-014", "Lumen Studio: website redesign", "Total: 4 200 EUR"]),
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
  "Done: I made an app called **Clients** with a client list and a board of deals by stage. Open it from My apps.\n\nWant a summary of open deals here every Monday morning?",
);
await say(DIRECT_CHAT_ID, user, "Yes, every Monday at 9.");

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

// A project with two helpers.
const project = await t.projects.create({
  name: "Landing page",
  brief: "@coder build a one-page site for the studio, then ask @reviewer to check it.",
  agents: ["coder", "reviewer"],
  startWith: "coder",
  kickoff: false,
});
const done = (name: string, tools: [string, string][]) => ({
  type: "run" as const,
  agent: name,
  status: "done" as const,
  tools: tools.map(([tool, summary]) => ({ name: tool, summary, isError: false })),
  usage: null,
  error: null,
  commit: null,
});
const work = (name: string, tools: [string, string][]) =>
  t.repo.createMessage({
    chatId: project.chat.id,
    author: agent(name),
    body: "",
    card: done(name, tools),
  });
await work("coder", [
  ["Write", "index.html"],
  ["Write", "styles.css"],
  ["Bash", "bun test"],
]);
await say(
  project.chat.id,
  agent("coder"),
  "The page is in place: a hero, three projects and a contact form. @reviewer please take a look.",
);
await work("reviewer", [
  ["Read", "index.html"],
  ["Read", "styles.css"],
]);
await say(
  project.chat.id,
  agent("reviewer"),
  "Looks clean. One thing: the contact form has no error message when the email is wrong.",
);

await t.repo.createMessage({
  chatId: project.chat.id,
  author: agent("reviewer"),
  body: "",
  card: {
    type: "task",
    taskId: "demo-1",
    title: "Show an error when the email is wrong",
    assignee: "coder",
    status: "doing",
  },
});

// An alert and what the Helper made of it.
await t.alerts.ingest("uptime", {
  severity: "warning",
  title: "Home server disk 92% full",
  message: "The backups folder grew by 40 GB this week.",
});
// The alert wakes the Helper, and the fake model answers with a stock line: drop it for a real one.
await Bun.sleep(300);
await t.runtime.whenIdle();
for (const m of await t.repo.listMessages(SYSTEM_CHAT_ID, { limit: 20 }))
  if (m.author.kind === "agent") await t.repo.deleteMessage(m.id);
await say(
  SYSTEM_CHAT_ID,
  agent("orchestrator"),
  "The disk fills up because of backups. I would keep only the last 4 weekly ones: **want me to set that up?**",
);

t.app.listen({ hostname: "127.0.0.1", port: PORT });
console.log(`Aura demo on http://127.0.0.1:${PORT} (open the web client on http://localhost:1420)`);

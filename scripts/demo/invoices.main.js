export default function activate(ctx) {
  const draw = async (el) => {
    el.innerHTML = "";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:12px;margin:8px 0 16px";
    const title = document.createElement("h2");
    title.textContent = "Invoices";
    title.style.margin = "0";
    head.append(title);
    el.append(head);
    ctx.ui.button(head, "Add files", async () => {
      await ctx.docs.pick({ accept: "application/pdf,image/*", multiple: true });
      draw(el);
    });
    const list = document.createElement("ul");
    list.style.cssText = "list-style:none;padding:0;margin:0;display:grid;gap:8px";
    for (const file of await ctx.docs.list()) {
      const row = document.createElement("li");
      row.style.cssText =
        "display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px solid var(--border)";
      const name = document.createElement("span");
      name.textContent = file.name;
      name.style.flex = "1";
      const size = document.createElement("small");
      size.textContent = Math.max(1, Math.round(file.size / 1024)) + " KB";
      row.append(name, size);
      ctx.ui.button(row, "View", () => ctx.docs.view(file.id));
      ctx.ui.button(row, "Save", () => ctx.docs.save(file.id));
      ctx.ui.button(row, "Delete", async () => {
        await ctx.docs.remove(file.id);
        draw(el);
      });
      list.append(row);
    }
    el.append(list);
  };
  ctx.ui.registerPanel({ title: "Invoices", render: draw });
}

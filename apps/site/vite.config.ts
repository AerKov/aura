import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The site lives at https://aerkov.github.io/aura/ (GitHub Pages); SITE_BASE overrides it, e.g.
// "/" for a custom domain.
export default defineConfig({
  base: process.env.SITE_BASE ?? "/aura/",
  // The logo and screenshots are the repository's own (docs/assets), served as they are.
  publicDir: "../../docs/assets",
  plugins: [react(), tailwindcss()],
  server: { port: 1430, strictPort: true },
});

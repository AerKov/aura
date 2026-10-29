import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const host = process.env.TAURI_DEV_HOST;

/**
 * pdf.js loads its standard fonts, colour profiles and decoders as files at run time (ADR 0036).
 * They are served from `/pdfjs/` in dev and copied next to the app in a build.
 */
function pdfjsAssets(): Plugin {
  const root = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  const folders = ["standard_fonts", "wasm", "iccs"];
  const filesOf = (folder: string) =>
    readdirSync(join(root, folder)).filter((f) => statSync(join(root, folder, f)).isFile());
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/pdfjs\/(standard_fonts|wasm|iccs)\/([\w.-]+)$/.exec(
          req.url?.split("?")[0] ?? "",
        );
        const file = match ? join(root, match[1] ?? "", match[2] ?? "") : null;
        if (!file || !existsSync(file)) return next();
        res.setHeader("content-type", "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const folder of folders)
        for (const name of filesOf(folder))
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${folder}/${name}`,
            source: readFileSync(join(root, folder, name)),
          });
    },
  };
}

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  // The server serves the web client (phones, ADR 0009) under /app/.
  base: process.env.AURA_WEB_BASE ?? "/",
  plugins: [react(), tailwindcss(), pdfjsAssets()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "oxc",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});

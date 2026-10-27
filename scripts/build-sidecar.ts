/**
 * Compiles the server into a single executable for the Tauri sidecar and copies the SurrealDB
 * native addon next to it. See docs/decisions/0001-surrealdb-embedded.md.
 *
 * Output (both git-ignored):
 *   apps/desktop/src-tauri/binaries/crew-server-<target-triple>[.exe]
 *   apps/desktop/src-tauri/resources/surrealdb-node.node
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const tauriDir = join(root, "apps/desktop/src-tauri");

function targetTriple(): string {
  const result = Bun.spawnSync(["rustc", "--print", "host-tuple"]);
  const triple = result.stdout.toString().trim();
  if (result.exitCode !== 0 || !triple) {
    throw new Error(`rustc --print host-tuple failed: ${result.stderr.toString()}`);
  }
  return triple;
}

function findNativeAddon(): string {
  const nativePkg = Bun.resolveSync(
    "@surrealdb/node-native/package.json",
    join(root, "apps/server"),
  );
  const scopeDir = dirname(dirname(nativePkg));
  for (const dir of readdirSync(scopeDir)) {
    if (!dir.startsWith("node-native-")) continue;
    const addon = readdirSync(join(scopeDir, dir)).find((file) => file.endsWith(".node"));
    if (addon) return join(scopeDir, dir, addon);
  }
  throw new Error("SurrealDB native addon for this platform not found. Run `bun install`.");
}

const triple = targetTriple();
const ext = process.platform === "win32" ? ".exe" : "";
const outfile = join(tauriDir, "binaries", `crew-server-${triple}${ext}`);
mkdirSync(dirname(outfile), { recursive: true });

const build = Bun.spawnSync(
  // No identifier minification: Elysia inspects handler source to decide which context to pass.
  [
    "bun",
    "build",
    "--compile",
    "--minify-whitespace",
    "--minify-syntax",
    "src/index.ts",
    "--outfile",
    outfile,
  ],
  { cwd: join(root, "apps/server"), stdout: "inherit", stderr: "inherit" },
);
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);

const addonOut = join(tauriDir, "resources", "surrealdb-node.node");
mkdirSync(dirname(addonOut), { recursive: true });
copyFileSync(findNativeAddon(), addonOut);

console.log(`sidecar: ${outfile}\nnative addon: ${addonOut}`);

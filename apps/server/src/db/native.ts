import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The embedded SurrealDB engine is a native Node-API addon. `bun build --compile` cannot embed it
 * through the package's dynamic `require`, so the compiled sidecar ships the `.node` file next to
 * itself (or Tauri passes its resource path). napi-rs loaders honour `NAPI_RS_NATIVE_LIBRARY_PATH`.
 *
 * Must run before `@surrealdb/node` is imported. See docs/decisions/0001-surrealdb-embedded.md.
 */
export function ensureNativeAddonPath(): void {
  if (process.env.NAPI_RS_NATIVE_LIBRARY_PATH) return;
  const dir = dirname(process.execPath);
  if (!existsSync(dir)) return;
  const addon = readdirSync(dir).find(
    (file) => file.startsWith("surrealdb-node.") && file.endsWith(".node"),
  );
  if (addon) process.env.NAPI_RS_NATIVE_LIBRARY_PATH = join(dir, addon);
}

/**
 * MapLibre spawns its web worker from a URL derived from `import.meta.url`.
 * Once the library is bundled that resolves inside /_next/static/chunks/, where
 * the worker file does not exist — the dev server answers with its HTML 404 page
 * and the worker dies on a MIME check, taking the whole map with it.
 *
 * Copying the worker (and the shared chunk it imports) into /public lets us point
 * `setWorkerUrl` at a stable path we actually serve. Re-run on install and before
 * dev/build so an upgraded maplibre-gl can never leave a stale worker behind.
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "maplibre");

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

const { version } = JSON.parse(
  await readFile(join(root, "node_modules", "maplibre-gl", "package.json"), "utf8"),
);

await mkdir(to, { recursive: true });
for (const file of FILES) {
  await copyFile(join(from, file), join(to, file));
}

console.log(`maplibre worker ${version} → public/maplibre/`);

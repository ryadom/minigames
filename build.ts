/* ============================================================================
 *  Build the deployable static site into dist/.
 *
 *  The site is still served as plain static files — there is no runtime
 *  framework. This step only turns the TypeScript sources into the JavaScript
 *  the browser loads and copies the rest of the site across:
 *
 *    1. Copy every static asset (HTML, CSS, images, not-yet-migrated game JS,
 *       PWA files, CNAME, …) into dist/, skipping tooling and .ts sources.
 *    2. Compile the shared runtime (shared/*.ts) to classic IIFE scripts that
 *       publish window.MG — so games that still load it via <script> keep
 *       working unchanged.
 *    3. Bundle each migrated game (ES modules) into a single module script.
 *
 *  Run with `bun run build`.
 * ========================================================================== */
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

const ROOT = import.meta.dir;
const DIST = join(ROOT, "dist");

// Directory names that are tooling / sources, never part of the served site.
const EXCLUDE_DIRS = new Set([
  ".git",
  ".github",
  ".claude",
  ".vscode",
  "node_modules",
  "dist",
  "scripts",
]);

// Root-level files that are tooling, not site content.
const EXCLUDE_FILES = new Set([
  "package.json",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "biome.json",
  "build.ts",
  "global.d.ts",
  "README.md",
  "CLAUDE.md",
]);

/** TypeScript sources are compiled (steps 2–3), never copied verbatim. */
function isSource(name: string): boolean {
  return extname(name) === ".ts";
}

/** Recursively copy static assets from `rel` (relative to ROOT) into dist/. */
async function copyStatic(rel: string): Promise<void> {
  const entries = await readdir(join(ROOT, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      await copyStatic(join(rel, entry.name));
    } else if (entry.isFile() && !EXCLUDE_FILES.has(entry.name) && !isSource(entry.name)) {
      const to = join(DIST, rel, entry.name);
      await mkdir(dirname(to), { recursive: true });
      await copyFile(join(ROOT, rel, entry.name), to);
    }
  }
}

async function bundle(
  label: string,
  entrypoints: string[],
  outdir: string,
  format: "iife" | "esm",
): Promise<void> {
  const result = await Bun.build({
    entrypoints: entrypoints.map((e) => join(ROOT, e)),
    outdir: join(DIST, outdir),
    format,
    target: "browser",
    minify: true,
    sourcemap: "linked",
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`${label} build failed`);
  }
}

async function main(): Promise<void> {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await copyStatic("");

  // Shared runtime → classic global scripts (window.MG) for legacy games.
  await bundle("shared runtime", ["shared/mg.ts", "shared/cards.ts"], "shared", "iife");

  // Migrated games → ES module bundles (one self-contained module each).
  await bundle("farm", ["games/farm/js/main.ts"], "games/farm/js", "esm");

  console.log("✓ build complete → dist/");
}

main();

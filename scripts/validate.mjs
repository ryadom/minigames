// Validates the project's structure without a build step:
//   • every game in the registry (games.js) has a title, icon and url,
//   • each game url points at a folder that contains an index.html,
//   • the shared runtime files exist,
//   • each game page actually loads the shared runtime.
//
// Run with `npm run check`. Exits non-zero on the first batch of failures,
// so it can be used as a CI / pre-commit gate.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

// --- Load the games registry (games.js sets window.GAMES). ---
const registrySrc = readFileSync(join(ROOT, "games.js"), "utf8");
const sandbox = { window: {}, navigator: { language: "en" } };
vm.createContext(sandbox);
vm.runInContext(registrySrc, sandbox);
const games = sandbox.window.GAMES;

if (!Array.isArray(games)) {
  errors.push("games.js did not define a window.GAMES array");
} else {
  games.forEach((game, i) => {
    const label = game && game.title ? `"${game.title}"` : `#${i}`;
    if (!game.title) errors.push(`game ${label}: missing title`);
    if (!game.icon) errors.push(`game ${label}: missing icon`);
    if (!game.url) {
      errors.push(`game ${label}: missing url`);
      return;
    }
    // url is like "./games/<name>/" — resolve relative to the repo root.
    const rel = game.url.replace(/^\.\//, "");
    const indexPath = join(ROOT, rel, "index.html");
    if (!existsSync(indexPath)) {
      errors.push(`game ${label}: ${game.url} has no index.html (${indexPath})`);
      return;
    }
    const html = readFileSync(indexPath, "utf8");
    if (!html.includes("shared/mg.js")) {
      errors.push(`game ${label}: ${game.url}index.html does not load shared/mg.js`);
    }
  });
}

// --- Shared runtime must exist. ---
for (const f of ["shared/mg.js", "shared/mg.css"]) {
  if (!existsSync(join(ROOT, f))) errors.push(`missing shared file: ${f}`);
}

// --- PWA assets must exist, and the manifest must be valid JSON with icons. ---
for (const f of ["manifest.webmanifest", "sw.js", "icon.svg"]) {
  if (!existsSync(join(ROOT, f))) errors.push(`missing PWA file: ${f}`);
}
if (existsSync(join(ROOT, "manifest.webmanifest"))) {
  try {
    const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.webmanifest"), "utf8"));
    if (!manifest.name) errors.push("manifest.webmanifest: missing name");
    if (!manifest.start_url) errors.push("manifest.webmanifest: missing start_url");
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      errors.push("manifest.webmanifest: needs at least one icon");
    } else {
      manifest.icons.forEach((icon) => {
        const src = icon && icon.src && icon.src.replace(/^\.\//, "");
        if (!src || !existsSync(join(ROOT, src))) {
          errors.push(`manifest.webmanifest: icon "${icon && icon.src}" not found`);
        }
      });
    }
  } catch (e) {
    errors.push(`manifest.webmanifest: invalid JSON (${e.message})`);
  }
}

if (errors.length) {
  console.error("✗ Validation failed:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log(`✓ ${Array.isArray(games) ? games.length : 0} game(s) validated — structure OK`);

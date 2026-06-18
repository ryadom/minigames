// Zero-dependency static file server for local development.
//
//   npm run dev            # serves the repo root at http://localhost:8000
//   PORT=3000 npm run dev  # custom port
//
// This is *only* a dev convenience. The site itself has no build step and is
// deployed as-is (see CLAUDE.md / .github/workflows/deploy.yml).

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Serve the build output (dist/) when SERVE_ROOT is set, else the repo root.
const ROOT = process.env.SERVE_ROOT
  ? normalize(resolve(process.env.SERVE_ROOT))
  : normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const PORT = Number(process.env.PORT || 8000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    // Strip query string and decode, then resolve safely under ROOT.
    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = normalize(join(ROOT, pathname));

    // Prevent path traversal outside the project root.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    // Directories resolve to their index.html.
    const info = await stat(filePath).catch(() => null);
    if (info && info.isDirectory()) filePath = join(filePath, "index.html");

    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type }).end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`Minigames dev server → http://localhost:${PORT}`);
});

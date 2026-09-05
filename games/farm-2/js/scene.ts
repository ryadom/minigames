/* ============================================================================
 *  Farm — the world scene (a buildable tile grid).
 *
 *  The world is a GRID_COLS × GRID_ROWS grid of square tiles surrounded by a
 *  grassy, fenced border. Everything the player owns — soil plots, shops and
 *  animal pens — is *placed* onto this grid in build mode; nothing is drawn
 *  at a fixed spot any more. The scene here is pure: it produces the SVG
 *  ground (grass, checkered tiles, grid lines, fence, a little flavour) and
 *  the geometry helpers the view layer uses to lay interactive cells over it.
 * ========================================================================== */
import { GRID_COLS, GRID_N, GRID_ROWS } from "./config";

export const TILE = 96; // world units per grid cell (smaller, finer grid)
export const PAD = 40; // grassy border around the grid
export const WORLD_W = GRID_COLS * TILE + PAD * 2;
export const WORLD_H = GRID_ROWS * TILE + PAD * 2;

/** Top-left world position of grid cell `i`. */
export function cellPos(i: number): { x: number; y: number } {
  const col = i % GRID_COLS;
  const row = Math.floor(i / GRID_COLS);
  return { x: PAD + col * TILE, y: PAD + row * TILE };
}

function nf(n: number): number {
  return Math.round(n * 10) / 10;
}
export function pf(n: number): number {
  return Math.round(n * 100) / 100;
}

function svgTree(x: number, y: number, r: number): string {
  return (
    `<ellipse cx="${nf(x)}" cy="${nf(y + r * 0.1)}" rx="${nf(r * 1.05)}" ry="${nf(r * 0.32)}" fill="rgba(0,0,0,0.15)"/>` +
    `<rect x="${nf(x - r * 0.16)}" y="${nf(y - r * 0.7)}" width="${nf(r * 0.32)}" height="${nf(r * 0.9)}" rx="${nf(r * 0.12)}" fill="#8a5a32"/>` +
    `<circle cx="${nf(x)}" cy="${nf(y - r * 1.05)}" r="${nf(r * 0.95)}" fill="#4e9b3f"/>` +
    `<circle cx="${nf(x - r * 0.45)}" cy="${nf(y - r * 0.75)}" r="${nf(r * 0.62)}" fill="#57a948"/>` +
    `<circle cx="${nf(x + r * 0.45)}" cy="${nf(y - r * 0.8)}" r="${nf(r * 0.6)}" fill="#458a39"/>` +
    `<circle cx="${nf(x - r * 0.3)}" cy="${nf(y - r * 1.35)}" r="${nf(r * 0.4)}" fill="#67bd55"/>`
  );
}

// A wooden post-and-rail fence segment between (x1,y) and (x2,y).
function svgFenceH(x1: number, x2: number, y: number): string {
  let s =
    `<line x1="${nf(x1)}" y1="${nf(y)}" x2="${nf(x2)}" y2="${nf(y)}" stroke="#c9a26a" stroke-width="6"/>` +
    `<line x1="${nf(x1)}" y1="${nf(y - 11)}" x2="${nf(x2)}" y2="${nf(y - 11)}" stroke="#dab57e" stroke-width="5"/>`;
  for (let x = x1; x <= x2 + 0.1; x += 40)
    s += `<rect x="${nf(x - 3)}" y="${nf(y - 20)}" width="6" height="28" rx="2" fill="#b98e58"/>`;
  return s;
}
function svgFenceV(y1: number, y2: number, x: number): string {
  let s =
    `<line x1="${nf(x)}" y1="${nf(y1)}" x2="${nf(x)}" y2="${nf(y2)}" stroke="#c9a26a" stroke-width="6"/>` +
    `<line x1="${nf(x - 11)}" y1="${nf(y1)}" x2="${nf(x - 11)}" y2="${nf(y2)}" stroke="#dab57e" stroke-width="5"/>`;
  for (let y = y1; y <= y2 + 0.1; y += 40)
    s += `<rect x="${nf(x - 20)}" y="${nf(y - 3)}" width="28" height="6" rx="2" fill="#b98e58"/>`;
  return s;
}

const DEFS =
  `<defs>` +
  `<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7d977"/><stop offset="1" stop-color="#86bf60"/></linearGradient>` +
  `</defs>`;

// Compose the ground: grass, the checkered grid of tiles, thin grid lines,
// a fence around the whole plot and a few corner trees for flavour.
export function buildScene(): string {
  let s = DEFS;
  s += `<rect x="0" y="0" width="${WORLD_W}" height="${WORLD_H}" fill="url(#grass)"/>`;

  // The playable region.
  const gx = PAD;
  const gy = PAD;
  const gw = GRID_COLS * TILE;
  const gh = GRID_ROWS * TILE;

  // Checkered tiles so empty cells read clearly as a build grid.
  for (let i = 0; i < GRID_N; i++) {
    const p = cellPos(i);
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const light = (col + row) % 2 === 0;
    s +=
      `<rect x="${nf(p.x + 3)}" y="${nf(p.y + 3)}" width="${TILE - 6}" height="${TILE - 6}" rx="14" ` +
      `fill="${light ? "#9ed06f" : "#93c765"}"/>`;
  }
  // Grid lines.
  let lines = "";
  for (let c = 0; c <= GRID_COLS; c++)
    lines += `<line x1="${nf(gx + c * TILE)}" y1="${nf(gy)}" x2="${nf(gx + c * TILE)}" y2="${nf(gy + gh)}"/>`;
  for (let r = 0; r <= GRID_ROWS; r++)
    lines += `<line x1="${nf(gx)}" y1="${nf(gy + r * TILE)}" x2="${nf(gx + gw)}" y2="${nf(gy + r * TILE)}"/>`;
  s += `<g stroke="rgba(60,90,40,0.18)" stroke-width="2">${lines}</g>`;

  // Fence around the whole plot.
  s += svgFenceH(gx - 14, gx + gw + 14, gy - 6);
  s += svgFenceH(gx - 14, gx + gw + 14, gy + gh + 14);
  s += svgFenceV(gy - 6, gy + gh + 14, gx - 6);
  s += svgFenceV(gy - 6, gy + gh + 14, gx + gw + 14);

  // Corner trees in the grassy border.
  s += svgTree(PAD * 0.5, PAD * 0.7, 26) + svgTree(WORLD_W - PAD * 0.5, PAD * 0.7, 24);
  s +=
    svgTree(PAD * 0.5, WORLD_H - PAD * 0.4, 26) +
    svgTree(WORLD_W - PAD * 0.5, WORLD_H - PAD * 0.4, 24);

  return s;
}

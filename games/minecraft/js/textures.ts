/* ==========================================================================
   Procedural texture atlas.

   No image assets ship with the repo, so every block tile is painted at
   boot onto one small canvas (a 4×4 grid of 16×16 pixel-art tiles) and
   uploaded as a single NEAREST-filtered WebGL texture. Each tile is drawn
   deterministically so the look is stable across reloads.
   ========================================================================== */

import {
  T_AXE,
  T_BRICK,
  T_COBBLE,
  T_CRAFT_SIDE,
  T_CRAFT_TOP,
  T_DIRT,
  T_GLASS,
  T_GRASS_SIDE,
  T_GRASS_TOP,
  T_LEAVES,
  T_LOG_SIDE,
  T_LOG_TOP,
  T_PICKAXE,
  T_PLANKS,
  T_SAND,
  T_STICK,
  T_STONE,
  T_SWORD,
  T_WATER,
} from "./blocks";

export const TILE = 16;
export const ATLAS_COLS = 4;
const ATLAS_ROWS = 5;
export const ATLAS_W = TILE * ATLAS_COLS;
export const ATLAS_H = TILE * ATLAS_ROWS;

/** Atlas UV rect for a tile, inset by half a texel to avoid edge bleeding. */
export function tileUV(tile: number): [number, number, number, number] {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const inset = 0.02 / TILE;
  const u0 = (col * TILE) / ATLAS_W + inset;
  const v0 = (row * TILE) / ATLAS_H + inset;
  const u1 = ((col + 1) * TILE) / ATLAS_W - inset;
  const v1 = ((row + 1) * TILE) / ATLAS_H - inset;
  return [u0, v0, u1, v1];
}

// Deterministic per-tile RNG (mulberry32) so textures look the same each run.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Painter = (ctx: CanvasRenderingContext2D, ox: number, oy: number, rnd: () => number) => void;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

/** Thick pixel-art line (used to draw the tool icons). */
function line(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  w = 1,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const half = (w - 1) >> 1;
  for (;;) {
    for (let oxw = -half; oxw <= half; oxw++) {
      for (let oyw = -half; oyw <= half; oyw++) px(ctx, ox + x + oxw, oy + y + oyw, color);
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

// Pick one of a few shades, weighted toward the first (the base colour).
function shade(rnd: () => number, shades: string[]): string {
  const r = rnd();
  const i = Math.floor(r * r * shades.length);
  return shades[Math.min(i, shades.length - 1)];
}

const GREEN = ["#5a9b3a", "#5fa83f", "#6cb046", "#4f9234", "#67ab43"];
const DIRT_C = ["#7a5a3c", "#866646", "#6f5236", "#80603f", "#73553a"];
const STONE_C = ["#8b8b8f", "#949499", "#828287", "#9c9ca1", "#88888d"];
const SAND_C = ["#dcc88f", "#e3d199", "#d4bd80", "#e8d7a4", "#d8c488"];

function fill16(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  painter: (x: number, y: number) => string,
): void {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) px(ctx, ox + x, oy + y, painter(x, y));
  }
}

const PAINTERS: Record<number, Painter> = {
  [T_GRASS_TOP]: (ctx, ox, oy, rnd) => fill16(ctx, ox, oy, () => shade(rnd, GREEN)),

  [T_GRASS_SIDE]: (ctx, ox, oy, rnd) => {
    fill16(ctx, ox, oy, (_x, y) =>
      y < 3 || (y < 5 && rnd() < 0.5) ? shade(rnd, GREEN) : shade(rnd, DIRT_C),
    );
  },

  [T_DIRT]: (ctx, ox, oy, rnd) => fill16(ctx, ox, oy, () => shade(rnd, DIRT_C)),

  [T_STONE]: (ctx, ox, oy, rnd) => fill16(ctx, ox, oy, () => shade(rnd, STONE_C)),

  [T_SAND]: (ctx, ox, oy, rnd) => fill16(ctx, ox, oy, () => shade(rnd, SAND_C)),

  [T_COBBLE]: (ctx, ox, oy, rnd) => {
    // Rounded cobbles: a darker mortar grid with lighter stone lumps.
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const cell = ((x >> 2) + (y >> 2)) & 1;
        const edge = x % 4 === 0 || y % 4 === 0;
        let c = shade(rnd, STONE_C);
        if (edge) c = "#5f5f64";
        else if (cell && rnd() < 0.5) c = "#a2a2a7";
        px(ctx, ox + x, oy + y, c);
      }
    }
  },

  [T_LOG_SIDE]: (ctx, ox, oy, rnd) => {
    const bark = ["#6b4a2a", "#5c3f24", "#765230", "#553a22"];
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let c = shade(rnd, bark);
        if (x % 5 === 2) c = "#4a3219"; // vertical grooves
        px(ctx, ox + x, oy + y, c);
      }
    }
  },

  [T_LOG_TOP]: (ctx, ox, oy, rnd) => {
    const rings = ["#9a7042", "#85602f", "#a87b49", "#6f4f28"];
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.round(Math.hypot(x - 7.5, y - 7.5));
        let c = rings[d % rings.length];
        if (d === 0) c = "#5c3f24";
        if (rnd() < 0.12) c = shade(rnd, rings);
        px(ctx, ox + x, oy + y, c);
      }
    }
  },

  [T_LEAVES]: (ctx, ox, oy, rnd) => {
    const leaf = ["#3f7a2c", "#357024", "#468a31", "#2c5e1f", "#4f9636"];
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const r = rnd();
        let c = shade(rnd, leaf);
        if (r < 0.1)
          c = "#234a18"; // dark gaps
        else if (r > 0.92) c = "#62a847"; // highlights
        px(ctx, ox + x, oy + y, c);
      }
    }
  },

  [T_PLANKS]: (ctx, ox, oy, rnd) => {
    const wood = ["#b08642", "#bd9149", "#a87c3c", "#c49a52"];
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let c = shade(rnd, wood);
        if (y % 5 === 4) c = "#7a5a2c"; // plank seams
        if ((y >> 2) % 2 === 0 ? x === 8 : x === 0) c = "#7a5a2c"; // staggered ends
        px(ctx, ox + x, oy + y, c);
      }
    }
  },

  [T_BRICK]: (ctx, ox, oy, rnd) => {
    const brick = ["#a8412f", "#b54a37", "#993a29", "#bd5440"];
    for (let y = 0; y < TILE; y++) {
      const rowOdd = (y >> 2) & 1;
      for (let x = 0; x < TILE; x++) {
        const sx = (x + (rowOdd ? 4 : 0)) % 8;
        let c = shade(rnd, brick);
        if (y % 4 === 3 || sx === 7) c = "#d6cdbf"; // mortar
        px(ctx, ox + x, oy + y, c);
      }
    }
  },

  [T_WATER]: (ctx, ox, oy, rnd) => {
    const blue = ["#2f6aa8", "#3573b3", "#2b619c", "#3a7abb"];
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let c = shade(rnd, blue);
        if ((x + y) % 7 === 0 && rnd() < 0.6) c = "#5b9bd6"; // glints
        px(ctx, ox + x, oy + y, c);
      }
    }
  },

  [T_GLASS]: (ctx, ox, oy, rnd) => {
    // Mostly see-through, with an opaque frame and a couple of shine streaks.
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const border = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        if (border) ctx.fillStyle = "rgba(214,236,255,0.85)";
        else if (x - y === -3 || x - y === 5) ctx.fillStyle = "rgba(230,245,255,0.4)";
        else ctx.fillStyle = `rgba(210,235,255,${0.08 + rnd() * 0.04})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  },

  // --- Crafting table: planks base overlaid with a tool grid. ---
  [T_CRAFT_TOP]: (ctx, ox, oy, rnd) => {
    PAINTERS[T_PLANKS](ctx, ox, oy, rnd);
    // 3×3 grid etched on the top.
    for (let i = 0; i <= 15; i += 5) {
      const p = Math.min(i, 15);
      line(ctx, ox, oy, p, 0, p, 15, "#5c401f");
      line(ctx, ox, oy, 0, p, 15, p, "#5c401f");
    }
  },

  [T_CRAFT_SIDE]: (ctx, ox, oy, rnd) => {
    PAINTERS[T_PLANKS](ctx, ox, oy, rnd);
    // A saw and a couple of tool marks on the side panel.
    line(ctx, ox, oy, 2, 4, 13, 4, "#5c401f");
    line(ctx, ox, oy, 3, 11, 12, 7, "#9c9ca1", 2); // saw blade
    line(ctx, ox, oy, 3, 11, 5, 13, "#7a5a2c", 2); // saw handle
  },

  // --- Items (drawn on a transparent background for icon use). ---
  [T_STICK]: (ctx, ox, oy) => {
    line(ctx, ox, oy, 4, 12, 11, 3, "#7a5a2c", 2);
    line(ctx, ox, oy, 4, 12, 11, 3, "#5c401f", 1);
  },

  [T_PICKAXE]: (ctx, ox, oy) => {
    line(ctx, ox, oy, 4, 13, 11, 5, "#7a5a2c", 2); // handle
    line(ctx, ox, oy, 2, 6, 13, 3, "#9c9ca1", 2); // head bar
    line(ctx, ox, oy, 2, 6, 4, 3, "#cfcfd4", 1); // tip highlights
    line(ctx, ox, oy, 11, 3, 13, 3, "#cfcfd4", 1);
  },

  [T_AXE]: (ctx, ox, oy) => {
    line(ctx, ox, oy, 5, 13, 10, 4, "#7a5a2c", 2); // handle
    // Axe head wedge near the top.
    for (let y = 2; y <= 8; y++) {
      const w = 4 - Math.abs(y - 5);
      for (let x = 0; x <= w + 2; x++) px(ctx, ox + 9 + x, oy + y, "#9c9ca1");
    }
    line(ctx, ox, oy, 11, 2, 11, 8, "#cfcfd4", 1);
  },

  [T_SWORD]: (ctx, ox, oy) => {
    line(ctx, ox, oy, 4, 12, 11, 4, "#cdd0d6", 3); // blade
    line(ctx, ox, oy, 5, 11, 11, 4, "#eef0f4", 1); // blade shine
    line(ctx, ox, oy, 2, 13, 5, 10, "#caa84a", 2); // guard
    line(ctx, ox, oy, 2, 13, 4, 15, "#7a5a2c", 2); // grip
  },
};

/** Paint the whole atlas onto a fresh canvas and return it. */
export function buildAtlas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  for (const key of Object.keys(PAINTERS)) {
    const tile = Number(key);
    const ox = (tile % ATLAS_COLS) * TILE;
    const oy = Math.floor(tile / ATLAS_COLS) * TILE;
    PAINTERS[tile](ctx, ox, oy, mulberry32(tile * 9176 + 13));
  }
  return canvas;
}

/** A small standalone canvas of one tile, for hotbar slot icons. */
export function tileIcon(atlas: HTMLCanvasElement, tile: number, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  const sx = (tile % ATLAS_COLS) * TILE;
  const sy = Math.floor(tile / ATLAS_COLS) * TILE;
  ctx.drawImage(atlas, sx, sy, TILE, TILE, 0, 0, size, size);
  return c;
}

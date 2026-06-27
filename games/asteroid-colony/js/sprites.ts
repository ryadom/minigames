/* ============================================================================
 *  Asteroid Colony — procedural sprite renderer.
 *
 *  Everything in the world used to be a flat colour swatch with a faint emoji
 *  on top. This module draws proper vector sprites onto the canvas instead:
 *
 *    • Duplicants  — chunky space-suited colonists with per-dupe suit colours,
 *                    a visor, swinging arms/legs that animate with walk speed,
 *                    an idle breathing bob, a distress flash and a sleeping pose.
 *    • Terrain     — bevelled, speckled tiles whose texture is seeded per cell
 *                    so it stays stable (algae glows, ore nuggets, ice crystals…).
 *    • Buildings   — little machines drawn shape-by-shape (a bubbling diffuser,
 *                    a spinning scrubber, a growing mealwood plant, a charging
 *                    battery, a puffing generator, …) that react to on/off.
 *
 *  All drawing is pure canvas 2D — no assets to load, so it stays offline-first
 *  and dependency-free like the rest of the site. Per-cell texture uses the
 *  shared mulberry32 PRNG seeded by the cell index, so it never shimmers.
 * ========================================================================== */
import { mulberry32 } from "./config";
import { state } from "./state";
import type { BuildingId, TileTypeDef } from "./types";

// --- small drawing helpers --------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Lighten/darken a `#rrggbb` colour by `amt` (−1..1). Used for cheap bevels. */
function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const n =
    h.length === 3
      ? Number.parseInt(
          h
            .split("")
            .map((c) => c + c)
            .join(""),
          16,
        )
      : Number.parseInt(h, 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

// --- duplicants -------------------------------------------------------------

// A cheerful suit palette; each dupe keeps one tied to its emoji "glyph" so the
// colony reads as a set of distinct little characters.
const SUIT_COLORS = [
  "#ff7a59",
  "#4aa3ff",
  "#ffc24a",
  "#7ed957",
  "#c07bff",
  "#ff5fa2",
  "#43d9c0",
  "#ff9b3d",
];
const GLYPH_ORDER = ["🧑‍🚀", "👩‍🚀", "🧑‍🔧", "👨‍🔧", "🧑‍🌾", "👩‍🌾"];

export function dupeColor(glyph: string): string {
  let i = GLYPH_ORDER.indexOf(glyph);
  if (i < 0) {
    // Stable hash for any unexpected glyph so colours stay deterministic.
    i = 0;
    for (let k = 0; k < glyph.length; k++) i = (i * 31 + glyph.charCodeAt(k)) | 0;
    i = Math.abs(i);
  }
  return SUIT_COLORS[i % SUIT_COLORS.length];
}

export interface DupeDraw {
  color: string;
  /** -1 faces left, +1 faces right. */
  facing: number;
  /** Accumulated walk phase (radians); legs/arms swing with sin/cos of it. */
  walk: number;
  /** 0..1 how fast the dupe is currently moving (scales limb swing). */
  speed: number;
  distress: boolean;
  sleeping: boolean;
  /** Free-running clock (ms) for idle breathing + distress pulse. */
  time: number;
}

/**
 * Draw one duplicant centred on (cx, cy) at footprint `s` (≈ a cell). The figure
 * stands on the ground line at cy + s*0.5; everything is sized relative to `s`.
 */
export function drawDupe(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  o: DupeDraw,
): void {
  const ground = cy + s * 0.46;
  const swing = Math.sin(o.walk) * o.speed;
  const lift = Math.abs(Math.cos(o.walk)) * o.speed; // tiny hop on each step
  const breathe = o.sleeping ? 0 : Math.sin(o.time / 600) * 0.012 * s;

  ctx.save();
  ctx.translate(cx, ground - breathe);
  ctx.scale(o.facing < 0 ? -1 : 1, 1); // mirror so the visor faces travel

  // Soft contact shadow.
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.02, s * 0.3, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  if (o.distress) {
    // Pulsing alarm halo.
    const p = 0.25 + 0.18 * (0.5 + 0.5 * Math.sin(o.time / 160));
    ctx.fillStyle = `rgba(255,71,87,${p})`;
    ctx.beginPath();
    ctx.arc(0, -s * 0.28, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const dark = shade(o.color, -0.32);
  const light = shade(o.color, 0.28);

  if (o.sleeping) {
    drawSleepingDupe(ctx, s, o, dark, light);
    ctx.restore();
    return;
  }

  // --- legs (swing in opposite phase) ---
  const legY = -s * 0.06;
  const legLen = s * 0.18;
  ctx.lineCap = "round";
  ctx.lineWidth = s * 0.11;
  ctx.strokeStyle = dark;
  for (const sgn of [-1, 1]) {
    const sw = swing * sgn * s * 0.12;
    ctx.beginPath();
    ctx.moveTo(sgn * s * 0.09, legY - s * 0.04);
    ctx.lineTo(sgn * s * 0.09 + sw, legY + legLen - lift * s * 0.04 * (sgn > 0 ? 1 : 0));
    ctx.stroke();
  }
  // Boots.
  ctx.fillStyle = shade(o.color, -0.5);
  for (const sgn of [-1, 1]) {
    const sw = swing * sgn * s * 0.12;
    ctx.beginPath();
    ctx.ellipse(sgn * s * 0.09 + sw, legY + legLen, s * 0.07, s * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- body (rounded suit torso) ---
  const bw = s * 0.42;
  const bh = s * 0.42;
  const by = -s * 0.06 - bh;
  const grad = ctx.createLinearGradient(-bw / 2, by, bw / 2, by + bh);
  grad.addColorStop(0, light);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  roundRect(ctx, -bw / 2, by, bw, bh, s * 0.14);
  ctx.fill();
  // Chest life-support panel.
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, -bw * 0.22, by + bh * 0.3, bw * 0.44, bh * 0.34, s * 0.04);
  ctx.fill();
  ctx.fillStyle = o.distress ? "#ff4757" : "#9dffe6";
  ctx.beginPath();
  ctx.arc(0, by + bh * 0.47, s * 0.035, 0, Math.PI * 2);
  ctx.fill();

  // --- arms (front arm swings opposite the front leg) ---
  ctx.strokeStyle = o.color;
  ctx.lineWidth = s * 0.085;
  const armY = by + bh * 0.32;
  for (const sgn of [-1, 1]) {
    const sw = -swing * sgn * s * 0.14;
    ctx.beginPath();
    ctx.moveTo(sgn * bw * 0.46, armY);
    ctx.lineTo(sgn * bw * 0.62 + sw, armY + s * 0.16);
    ctx.stroke();
    // Glove.
    ctx.fillStyle = shade(o.color, -0.5);
    ctx.beginPath();
    ctx.arc(sgn * bw * 0.62 + sw, armY + s * 0.16, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- head + helmet ---
  const hr = s * 0.2;
  const hy = by - hr * 0.65;
  // Helmet shell.
  ctx.fillStyle = shade(o.color, 0.12);
  ctx.beginPath();
  ctx.arc(0, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  // Skin + visor: face peeks out of a dark glass visor.
  ctx.fillStyle = "#ffe0bd";
  ctx.beginPath();
  ctx.arc(0, hy, hr * 0.78, 0, Math.PI * 2);
  ctx.fill();
  // Visor glass over the front half.
  const vg = ctx.createLinearGradient(-hr, hy - hr, hr, hy + hr);
  vg.addColorStop(0, "rgba(120,220,255,0.95)");
  vg.addColorStop(1, "rgba(20,60,110,0.95)");
  ctx.fillStyle = vg;
  ctx.beginPath();
  ctx.ellipse(hr * 0.12, hy, hr * 0.62, hr * 0.66, 0, 0, Math.PI * 2);
  ctx.fill();
  // Visor glints.
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.ellipse(hr * 0.3, hy - hr * 0.22, hr * 0.16, hr * 0.26, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // Helmet antenna.
  ctx.strokeStyle = shade(o.color, -0.3);
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.moveTo(-hr * 0.55, hy - hr * 0.7);
  ctx.lineTo(-hr * 0.75, hy - hr * 1.15);
  ctx.stroke();
  ctx.fillStyle = "#9dffe6";
  ctx.beginPath();
  ctx.arc(-hr * 0.75, hy - hr * 1.2, s * 0.028, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSleepingDupe(
  ctx: CanvasRenderingContext2D,
  s: number,
  o: DupeDraw,
  dark: string,
  light: string,
): void {
  // Lying down: a rounded sleeping-bag body with the helmet at one end.
  const bw = s * 0.6;
  const bh = s * 0.26;
  const grad = ctx.createLinearGradient(0, -bh, 0, 0);
  grad.addColorStop(0, light);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  roundRect(ctx, -bw * 0.5, -bh, bw, bh, bh * 0.5);
  ctx.fill();
  // Helmet bubble.
  const hr = s * 0.16;
  ctx.fillStyle = shade(o.color, 0.12);
  ctx.beginPath();
  ctx.arc(bw * 0.42, -bh * 0.5, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(120,220,255,0.9)";
  ctx.beginPath();
  ctx.arc(bw * 0.42, -bh * 0.5, hr * 0.6, 0, Math.PI * 2);
  ctx.fill();
  // Floating Zzz.
  const t = o.time / 500;
  ctx.fillStyle = "rgba(200,235,255,0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 3; i++) {
    const a = (t + i * 0.6) % 3;
    ctx.globalAlpha = Math.max(0, 1 - a / 3);
    ctx.font = `${s * (0.13 + i * 0.04)}px system-ui`;
    ctx.fillText("z", -bw * 0.2 + i * s * 0.12, -bh - s * 0.18 - a * s * 0.12);
  }
  ctx.globalAlpha = 1;
}

// --- terrain tiles ----------------------------------------------------------

/**
 * Draw a solid terrain tile with a bevel and per-material texture. The texture
 * is seeded from `cellIndex` so a given cell always looks the same (no shimmer).
 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  def: TileTypeDef,
  x: number,
  y: number,
  px: number,
  cellIndex: number,
): void {
  const base = def.color;
  // Base fill with a soft vertical gradient for depth.
  const g = ctx.createLinearGradient(x, y, x, y + px);
  g.addColorStop(0, shade(base, 0.1));
  g.addColorStop(1, shade(base, -0.18));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, px + 0.5, px + 0.5);

  // Bevel: light top/left edge, dark bottom/right edge → a tiled, chiselled look.
  const bevel = Math.max(1, px * 0.08);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(x, y, px, bevel);
  ctx.fillRect(x, y, bevel, px);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x, y + px - bevel, px, bevel);
  ctx.fillRect(x + px - bevel, y, bevel, px);

  if (px < 9) return; // too small to bother texturing
  const rng = mulberry32((cellIndex + 1) * 0x9e3779b1);
  textureFor(ctx, def.id, x, y, px, rng);
}

function textureFor(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  px: number,
  rng: () => number,
): void {
  const at = (m = 0.16) => ({
    px: x + (m + rng() * (1 - 2 * m)) * px,
    py: y + (m + rng() * (1 - 2 * m)) * px,
  });

  switch (id) {
    case "dirt": {
      // Scattered grit + a couple of pebbles.
      for (let i = 0; i < 7; i++) {
        const p = at(0.1);
        ctx.fillStyle = rng() < 0.5 ? "rgba(0,0,0,0.18)" : "rgba(255,235,200,0.14)";
        ctx.beginPath();
        ctx.arc(p.px, p.py, px * (0.02 + rng() * 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "rock": {
      // Faceted cracks.
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = Math.max(1, px * 0.03);
      for (let i = 0; i < 2; i++) {
        const a = at();
        const b = at();
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      const f = at();
      ctx.beginPath();
      ctx.arc(f.px, f.py, px * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "algaeRock": {
      // Glowing green algae blobs.
      for (let i = 0; i < 5; i++) {
        const p = at(0.14);
        const r = px * (0.06 + rng() * 0.06);
        const gg = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, r);
        gg.addColorStop(0, "rgba(150,255,170,0.85)");
        gg.addColorStop(1, "rgba(90,200,120,0)");
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(p.px, p.py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "oreRock": {
      // Metallic copper nuggets with a highlight.
      for (let i = 0; i < 4; i++) {
        const p = at();
        const r = px * (0.05 + rng() * 0.05);
        ctx.fillStyle = "#c8843a";
        ctx.beginPath();
        ctx.arc(p.px, p.py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,225,170,0.85)";
        ctx.beginPath();
        ctx.arc(p.px - r * 0.3, p.py - r * 0.3, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "coalRock": {
      // Black chunks with a faint sheen.
      for (let i = 0; i < 5; i++) {
        const p = at();
        const r = px * (0.05 + rng() * 0.06);
        ctx.fillStyle = "rgba(10,10,14,0.9)";
        ctx.beginPath();
        ctx.arc(p.px, p.py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(120,140,170,0.35)";
        ctx.beginPath();
        ctx.arc(p.px - r * 0.3, p.py - r * 0.3, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "iceRock": {
      // Crystalline white facets + sparkle.
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = Math.max(1, px * 0.03);
      for (let i = 0; i < 3; i++) {
        const a = at(0.2);
        const len = px * 0.18;
        const ang = rng() * Math.PI;
        ctx.beginPath();
        ctx.moveTo(a.px - Math.cos(ang) * len, a.py - Math.sin(ang) * len);
        ctx.lineTo(a.px + Math.cos(ang) * len, a.py + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const sp = at();
      ctx.beginPath();
      ctx.arc(sp.px, sp.py, px * 0.04, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "obsidian": {
      // Glassy diagonal highlight.
      ctx.strokeStyle = "rgba(150,170,210,0.4)";
      ctx.lineWidth = Math.max(1, px * 0.05);
      ctx.beginPath();
      ctx.moveTo(x + px * 0.2, y + px * 0.7);
      ctx.lineTo(x + px * 0.7, y + px * 0.2);
      ctx.stroke();
      break;
    }
  }
}

// --- buildings --------------------------------------------------------------

/**
 * Draw a building machine within the cell box (x, y, px). `on` tints it active,
 * `grow` (0..1) drives the mealwood plant, and `time` (ms) animates moving bits.
 */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  id: BuildingId,
  x: number,
  y: number,
  px: number,
  on: boolean,
  grow: number,
  time: number,
): void {
  const cx = x + px / 2;
  const cy = y + px / 2;
  ctx.save();
  ctx.globalAlpha = on ? 1 : 0.78;

  switch (id) {
    case "diffuser":
      drawDiffuser(ctx, x, y, px, on, time);
      break;
    case "electrolyzer":
      drawElectrolyzer(ctx, x, y, px, on, time);
      break;
    case "scrubber":
      drawScrubber(ctx, cx, cy, px, on, time);
      break;
    case "mealwood":
      drawMealwood(ctx, x, y, px, grow);
      break;
    case "rationBox":
      drawRationBox(ctx, x, y, px);
      break;
    case "bed":
      drawBed(ctx, x, y, px);
      break;
    case "generator":
      drawGenerator(ctx, x, y, px, on, time);
      break;
    case "battery":
      drawBattery(ctx, x, y, px);
      break;
    case "cooler":
      drawCooler(ctx, cx, cy, px, on, time);
      break;
  }
  ctx.restore();
}

function metalBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: string,
): void {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, shade(c, 0.25));
  g.addColorStop(1, shade(c, -0.25));
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.18);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(1, w * 0.04);
  ctx.stroke();
}

function statusLight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  on: boolean,
): void {
  ctx.fillStyle = on ? "#5dff9a" : "#ff5b5b";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (on) {
    ctx.fillStyle = "rgba(120,255,180,0.35)";
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDiffuser(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  on: boolean,
  time: number,
): void {
  metalBox(ctx, x + px * 0.18, y + px * 0.28, px * 0.64, px * 0.58, "#5a8f86");
  // Vent grille.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + px * 0.26, y + px * 0.4 + i * px * 0.12, px * 0.48, px * 0.05);
  }
  // Rising O2 bubbles when running.
  if (on) {
    for (let i = 0; i < 4; i++) {
      const ph = (time / 700 + i * 0.27) % 1;
      ctx.globalAlpha = (1 - ph) * 0.8;
      ctx.fillStyle = "#7af3e0";
      ctx.beginPath();
      ctx.arc(
        x + px * (0.32 + i * 0.13),
        y + px * (0.28 - ph * 0.22),
        px * 0.05 * (0.6 + ph * 0.6),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  statusLight(ctx, x + px * 0.72, y + px * 0.36, px * 0.04, on);
}

function drawElectrolyzer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  on: boolean,
  time: number,
): void {
  metalBox(ctx, x + px * 0.2, y + px * 0.22, px * 0.6, px * 0.64, "#7d8aa8");
  // Glass tank with water + electrolysis bubbles.
  const tx = x + px * 0.3;
  const tw = px * 0.4;
  const ty = y + px * 0.32;
  const th = px * 0.42;
  ctx.fillStyle = "rgba(80,160,230,0.55)";
  ctx.fillRect(tx, ty, tw, th);
  if (on) {
    ctx.fillStyle = "rgba(220,250,255,0.9)";
    for (let i = 0; i < 5; i++) {
      const ph = (time / 500 + i * 0.2) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath();
      ctx.arc(tx + ((i + 0.5) / 5) * tw, ty + th - ph * th, px * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = Math.max(1, px * 0.03);
  ctx.strokeRect(tx, ty, tw, th);
  statusLight(ctx, x + px * 0.7, y + px * 0.3, px * 0.04, on);
}

function drawScrubber(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  px: number,
  on: boolean,
  time: number,
): void {
  metalBox(ctx, cx - px * 0.32, cy - px * 0.3, px * 0.64, px * 0.6, "#6f6aa0");
  // Spinning intake swirl.
  ctx.save();
  ctx.translate(cx, cy - px * 0.02);
  if (on) ctx.rotate((time / 600) % (Math.PI * 2));
  ctx.strokeStyle = "#bcd0ff";
  ctx.lineWidth = Math.max(1.5, px * 0.05);
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.arc(0, 0, px * 0.18, 0, Math.PI * 0.9);
    ctx.stroke();
  }
  ctx.restore();
  statusLight(ctx, cx + px * 0.22, cy - px * 0.22, px * 0.04, on);
}

function drawMealwood(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  grow: number,
): void {
  // Planter pot.
  const pot = y + px * 0.62;
  ctx.fillStyle = "#7a4f33";
  roundRect(ctx, x + px * 0.28, pot, px * 0.44, px * 0.28, px * 0.05);
  ctx.fill();
  ctx.fillStyle = "#3a261a";
  ctx.fillRect(x + px * 0.28, pot, px * 0.44, px * 0.06);
  // Stem grows with maturity.
  const h = px * (0.12 + grow * 0.38);
  const baseX = x + px * 0.5;
  ctx.strokeStyle = "#3f9a4a";
  ctx.lineWidth = Math.max(1.5, px * 0.05);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(baseX, pot);
  ctx.lineTo(baseX, pot - h);
  ctx.stroke();
  // Leaves.
  const leaves = 1 + Math.floor(grow * 3);
  ctx.fillStyle = "#5ec760";
  for (let i = 0; i < leaves; i++) {
    const ly = pot - (h * (i + 1)) / (leaves + 0.5);
    const sgn = i % 2 === 0 ? -1 : 1;
    ctx.beginPath();
    ctx.ellipse(baseX + sgn * px * 0.1, ly, px * 0.11, px * 0.05, sgn * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ripe berries when fully grown.
  if (grow > 0.85) {
    ctx.fillStyle = "#ff6b6b";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(baseX + sgn * px * 0.08, pot - h + px * 0.04, px * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRationBox(ctx: CanvasRenderingContext2D, x: number, y: number, px: number): void {
  const bx = x + px * 0.2;
  const by = y + px * 0.34;
  const bw = px * 0.6;
  const bh = px * 0.52;
  metalBox(ctx, bx, by, bw, bh, "#b98a4a");
  // Lid line + strap.
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(1, px * 0.035);
  ctx.beginPath();
  ctx.moveTo(bx, by + bh * 0.32);
  ctx.lineTo(bx + bw, by + bh * 0.32);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(bx + bw * 0.42, by, bw * 0.16, bh);
  // Food icon.
  ctx.fillStyle = "#ffd27a";
  ctx.beginPath();
  ctx.arc(x + px * 0.5, by + bh * 0.65, px * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawBed(ctx: CanvasRenderingContext2D, x: number, y: number, px: number): void {
  const by = y + px * 0.5;
  const bw = px * 0.74;
  const bh = px * 0.3;
  const bx = x + (px - bw) / 2;
  // Frame.
  ctx.fillStyle = "#6c4a8f";
  roundRect(ctx, bx, by, bw, bh, px * 0.06);
  ctx.fill();
  // Mattress + blanket.
  ctx.fillStyle = "#dfe6ff";
  roundRect(ctx, bx + px * 0.03, by - px * 0.05, bw - px * 0.06, bh * 0.6, px * 0.04);
  ctx.fill();
  ctx.fillStyle = "#7f9cff";
  roundRect(ctx, bx + bw * 0.42, by - px * 0.05, bw * 0.55, bh * 0.6, px * 0.04);
  ctx.fill();
  // Pillow.
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, bx + px * 0.05, by - px * 0.02, bw * 0.22, bh * 0.4, px * 0.03);
  ctx.fill();
  // Legs.
  ctx.fillStyle = "#4a3163";
  ctx.fillRect(bx + px * 0.02, by + bh, px * 0.05, px * 0.1);
  ctx.fillRect(bx + bw - px * 0.07, by + bh, px * 0.05, px * 0.1);
}

function drawGenerator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  on: boolean,
  time: number,
): void {
  metalBox(ctx, x + px * 0.16, y + px * 0.34, px * 0.68, px * 0.52, "#586068");
  // Chimney.
  ctx.fillStyle = "#3a3f45";
  ctx.fillRect(x + px * 0.6, y + px * 0.16, px * 0.14, px * 0.22);
  // Firebox glow + smoke puffs when on.
  if (on) {
    const glow = 0.6 + 0.4 * Math.sin(time / 200);
    ctx.fillStyle = `rgba(255,140,40,${0.5 + glow * 0.4})`;
    roundRect(ctx, x + px * 0.24, y + px * 0.52, px * 0.28, px * 0.24, px * 0.03);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const ph = (time / 900 + i * 0.33) % 1;
      ctx.globalAlpha = (1 - ph) * 0.5;
      ctx.fillStyle = "#9aa0a8";
      ctx.beginPath();
      ctx.arc(x + px * 0.67, y + px * 0.16 - ph * px * 0.18, px * 0.05 * (1 + ph), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = "rgba(120,80,40,0.5)";
    roundRect(ctx, x + px * 0.24, y + px * 0.52, px * 0.28, px * 0.24, px * 0.03);
    ctx.fill();
  }
  statusLight(ctx, x + px * 0.74, y + px * 0.42, px * 0.04, on);
}

function drawBattery(ctx: CanvasRenderingContext2D, x: number, y: number, px: number): void {
  const bx = x + px * 0.3;
  const by = y + px * 0.24;
  const bw = px * 0.4;
  const bh = px * 0.62;
  // Terminal nub.
  ctx.fillStyle = "#cfd6e0";
  ctx.fillRect(bx + bw * 0.3, by - px * 0.06, bw * 0.4, px * 0.06);
  metalBox(ctx, bx, by, bw, bh, "#3c4250");
  // Charge fill from the colony's battery level.
  const frac = state.batteryCap > 0 ? Math.min(1, state.battery / state.batteryCap) : 0;
  const innerH = bh - px * 0.1;
  const fillH = innerH * frac;
  ctx.fillStyle = frac > 0.25 ? "#5dff9a" : "#ffb14a";
  roundRect(
    ctx,
    bx + px * 0.05,
    by + px * 0.05 + (innerH - fillH),
    bw - px * 0.1,
    fillH,
    px * 0.02,
  );
  ctx.fill();
  // Lightning bolt.
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.moveTo(x + px * 0.52, by + bh * 0.25);
  ctx.lineTo(x + px * 0.42, by + bh * 0.55);
  ctx.lineTo(x + px * 0.5, by + bh * 0.55);
  ctx.lineTo(x + px * 0.46, by + bh * 0.78);
  ctx.lineTo(x + px * 0.6, by + bh * 0.45);
  ctx.lineTo(x + px * 0.52, by + bh * 0.45);
  ctx.closePath();
  ctx.fill();
}

function drawCooler(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  px: number,
  on: boolean,
  time: number,
): void {
  metalBox(ctx, cx - px * 0.32, cy - px * 0.3, px * 0.64, px * 0.6, "#4a7fa0");
  // Cold vents.
  ctx.strokeStyle = "rgba(220,245,255,0.7)";
  ctx.lineWidth = Math.max(1, px * 0.035);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - px * 0.22, cy - px * 0.16 + i * px * 0.14);
    ctx.lineTo(cx + px * 0.22, cy - px * 0.16 + i * px * 0.14);
    ctx.stroke();
  }
  // Rotating snowflake when on.
  ctx.save();
  ctx.translate(cx, cy - px * 0.02);
  if (on) ctx.rotate((time / 1200) % (Math.PI * 2));
  ctx.strokeStyle = "#eaffff";
  ctx.lineWidth = Math.max(1.5, px * 0.04);
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -px * 0.16);
    ctx.stroke();
  }
  ctx.restore();
  statusLight(ctx, cx + px * 0.22, cy - px * 0.22, px * 0.04, on);
}

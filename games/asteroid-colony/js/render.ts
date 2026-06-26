/* ============================================================================
 *  Asteroid Colony — canvas renderer + camera.
 *
 *  Owns the camera (pan/zoom) and draws the whole world: solid tiles, the gas /
 *  water / heat field overlays, buildings, blueprints under construction, and
 *  the duplicants with a hint of their current errand. Only the visible cell
 *  range is drawn (culling), so the dense grid stays cheap.
 * ========================================================================== */
import {
  BUILD_BY_ID,
  CELL,
  CELL_WATER_CAP,
  COLS,
  colOf,
  idx,
  O2_TARGET,
  ROWS,
  rowOf,
  SPACE_ROWS,
  TILE_BY_ID,
} from "./config";
import { state } from "./state";
import type { JobKind } from "./types";

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let W = 0; // css px
let H = 0;
let dpr = 1;

// Camera: screen_px = world_px * scale + (tx,ty); world_px = cell * CELL.
let scale = 1;
let tx = 0;
let ty = 0;
const WORLD_W = COLS * CELL;
const WORLD_H = ROWS * CELL;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;

let hoverCell = -1;

const JOB_ICON: Record<JobKind, string> = { dig: "⛏️", build: "🔨", sleep: "💤", eat: "🍽️" };

export function initRender(cv: HTMLCanvasElement): void {
  canvas = cv;
  ctx = cv.getContext("2d") as CanvasRenderingContext2D;
}

export function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

function clampCamera(): void {
  scale = Math.max(fitScale() * MIN_ZOOM, Math.min(fitScale() * MAX_ZOOM, scale));
  const sw = WORLD_W * scale;
  const sh = WORLD_H * scale;
  // Keep the world on screen (centre it when smaller than the viewport).
  if (sw <= W) tx = (W - sw) / 2;
  else tx = Math.max(W - sw, Math.min(0, tx));
  if (sh <= H) ty = (H - sh) / 2;
  else ty = Math.max(H - sh, Math.min(0, ty));
}

function fitScale(): number {
  return Math.min(W / WORLD_W, H / WORLD_H);
}

let initialised = false;
export function ensureScale(): void {
  if (!initialised) {
    scale = fitScale() * 1.1;
    initialised = true;
  }
  clampCamera();
}

export function panBy(dx: number, dy: number): void {
  tx += dx;
  ty += dy;
  clampCamera();
}

export function zoomAtPoint(px: number, py: number, factor: number): void {
  const wx = (px - tx) / scale;
  const wy = (py - ty) / scale;
  scale *= factor;
  clampCamera();
  tx = px - wx * scale;
  ty = py - wy * scale;
  clampCamera();
}

/** Screen pixel → grid cell index, or -1 if outside the grid. */
export function screenToCell(px: number, py: number): number {
  const c = Math.floor((px - tx) / scale / CELL);
  const r = Math.floor((py - ty) / scale / CELL);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
  return idx(c, r);
}

export function setHover(i: number): void {
  hoverCell = i;
}

function heatColor(temp: number): string {
  // -20°C (blue) → 80°C (red).
  const tNorm = Math.max(0, Math.min(1, (temp + 20) / 100));
  const r = Math.round(40 + tNorm * 200);
  const b = Math.round(220 - tNorm * 200);
  const g = Math.round(80 + (1 - Math.abs(tNorm - 0.5) * 2) * 80);
  return `rgb(${r},${g},${b})`;
}

export function draw(): void {
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, W, H);

  const cellPx = CELL * scale;
  const c0 = Math.max(0, Math.floor(-tx / cellPx));
  const c1 = Math.min(COLS, Math.ceil((W - tx) / cellPx));
  const r0 = Math.max(0, Math.floor(-ty / cellPx));
  const r1 = Math.min(ROWS, Math.ceil((H - ty) / cellPx));

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glyph = Math.min(cellPx * 0.7, 30);

  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const i = idx(c, r);
      const t = state.grid[i];
      const x = tx + c * cellPx;
      const y = ty + r * cellPx;

      if (t.solid !== null) {
        const def = TILE_BY_ID[t.solid];
        ctx.fillStyle = def.color;
        ctx.fillRect(x, y, cellPx + 0.5, cellPx + 0.5);
        if (def.ico && cellPx > 14) {
          ctx.globalAlpha = 0.5;
          ctx.font = `${glyph}px system-ui`;
          ctx.fillText(def.ico, x + cellPx / 2, y + cellPx / 2);
          ctx.globalAlpha = 1;
        }
        if (t.marked) drawDigMark(x, y, cellPx, (t.digProgress || 0) / def.hardness);
        continue;
      }

      // Open cell: base, then field overlays.
      ctx.fillStyle = r < SPACE_ROWS ? "#04060b" : "#0b0e16";
      ctx.fillRect(x, y, cellPx + 0.5, cellPx + 0.5);
      drawFields(t, x, y, cellPx);
      if (t.build) drawBuilding(t.build, t.on === true, x, y, cellPx, glyph);
      else if (t.blueprint) drawBlueprint(t.blueprint, t.buildProgress || 0, x, y, cellPx, glyph);
    }
  }

  // Build ghost under the cursor when in build mode.
  if (state.tool === "build" && hoverCell >= 0) {
    const t = state.grid[hoverCell];
    const x = tx + colOf(hoverCell) * cellPx;
    const y = ty + rowOf(hoverCell) * cellPx;
    const ok = t.solid === null && !t.build && !t.blueprint;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ok ? "rgba(0,230,200,0.25)" : "rgba(255,71,87,0.3)";
    ctx.fillRect(x, y, cellPx, cellPx);
    ctx.font = `${glyph}px system-ui`;
    ctx.fillText(BUILD_BY_ID[state.buildSel].ico, x + cellPx / 2, y + cellPx / 2);
    ctx.globalAlpha = 1;
  }

  drawDupes(cellPx, glyph);
}

function drawFields(
  t: { o2: number; co2: number; water: number; temp: number },
  x: number,
  y: number,
  cellPx: number,
): void {
  if (state.view === "heat") {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = heatColor(t.temp);
    ctx.fillRect(x, y, cellPx, cellPx);
    ctx.globalAlpha = 1;
  } else {
    const strong = state.view === "oxygen";
    const o2a = Math.min(1, t.o2 / O2_TARGET) * (strong ? 0.6 : 0.22);
    if (o2a > 0.02) {
      ctx.globalAlpha = o2a;
      ctx.fillStyle = "#36e0d0";
      ctx.fillRect(x, y, cellPx, cellPx);
    }
    const co2a = Math.min(1, t.co2 / O2_TARGET) * (strong ? 0.6 : 0.25);
    if (co2a > 0.02) {
      ctx.globalAlpha = co2a;
      ctx.fillStyle = "#7a5a3a";
      ctx.fillRect(x, y, cellPx, cellPx);
    }
    ctx.globalAlpha = 1;
  }
  // Water sits at the bottom of the cell regardless of view mode.
  if (t.water > 1) {
    const h = Math.min(1, t.water / CELL_WATER_CAP) * cellPx;
    ctx.fillStyle = "rgba(64,150,230,0.78)";
    ctx.fillRect(x, y + cellPx - h, cellPx, h);
  }
}

function drawDigMark(x: number, y: number, cellPx: number, progress: number): void {
  ctx.strokeStyle = "rgba(255,200,80,0.9)";
  ctx.lineWidth = Math.max(1, cellPx * 0.06);
  const m = cellPx * 0.18;
  ctx.beginPath();
  ctx.moveTo(x + m, y + m);
  ctx.lineTo(x + cellPx - m, y + cellPx - m);
  ctx.moveTo(x + cellPx - m, y + m);
  ctx.lineTo(x + m, y + cellPx - m);
  ctx.stroke();
  if (progress > 0) {
    ctx.strokeStyle = "#00e6c8";
    ctx.beginPath();
    ctx.arc(
      x + cellPx / 2,
      y + cellPx / 2,
      cellPx * 0.32,
      -Math.PI / 2,
      -Math.PI / 2 + progress * Math.PI * 2,
    );
    ctx.stroke();
  }
}

function drawBuilding(
  id: string,
  on: boolean,
  x: number,
  y: number,
  cellPx: number,
  glyph: number,
): void {
  ctx.fillStyle = on ? "rgba(0,230,200,0.16)" : "rgba(120,90,60,0.14)";
  ctx.fillRect(x, y, cellPx, cellPx);
  ctx.font = `${glyph}px system-ui`;
  ctx.globalAlpha = on ? 1 : 0.6;
  ctx.fillText(BUILD_BY_ID[id].ico, x + cellPx / 2, y + cellPx / 2);
  ctx.globalAlpha = 1;
}

function drawBlueprint(
  id: string,
  progress: number,
  x: number,
  y: number,
  cellPx: number,
  glyph: number,
): void {
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "rgba(0,230,200,0.12)";
  ctx.fillRect(x, y, cellPx, cellPx);
  ctx.font = `${glyph}px system-ui`;
  ctx.fillText(BUILD_BY_ID[id].ico, x + cellPx / 2, y + cellPx / 2);
  ctx.globalAlpha = 1;
  const frac = Math.min(1, progress / 3000);
  if (frac > 0) {
    ctx.strokeStyle = "#00e6c8";
    ctx.lineWidth = Math.max(1, cellPx * 0.06);
    ctx.beginPath();
    ctx.arc(
      x + cellPx / 2,
      y + cellPx / 2,
      cellPx * 0.34,
      -Math.PI / 2,
      -Math.PI / 2 + frac * Math.PI * 2,
    );
    ctx.stroke();
  }
}

function drawDupes(cellPx: number, glyph: number): void {
  ctx.font = `${Math.min(cellPx * 0.8, 32)}px system-ui`;
  for (const d of state.dupes) {
    if (!d.alive) continue;
    const x = tx + d.cx * cellPx;
    const y = ty + d.cy * cellPx;
    const distress = d.o2Debt > 1 || d.heatDebt > 1 || d.foodDebt > 1;
    if (distress) {
      ctx.fillStyle = "rgba(255,71,87,0.35)";
      ctx.beginPath();
      ctx.arc(x, y, cellPx * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillText(d.glyph, x, y);
    if (d.job && cellPx > 16) {
      ctx.font = `${Math.min(cellPx * 0.42, 16)}px system-ui`;
      ctx.fillText(JOB_ICON[d.job.kind], x + cellPx * 0.34, y - cellPx * 0.4);
      ctx.font = `${Math.min(cellPx * 0.8, 32)}px system-ui`;
    }
  }
  void glyph;
}

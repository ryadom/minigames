/* ============================================================================
 *  Asteroid Colony — pointer input + player actions.
 *
 *  One finger drags to pan (with a tap dead-zone), two fingers pinch-zoom, the
 *  wheel zooms on desktop. A tap issues the current tool's intent on a cell:
 *  queue/clear a dig, drop a building blueprint, or cancel. The duplicants are
 *  what actually carry the work out — taps only enqueue jobs.
 * ========================================================================== */
import { BUILD_BY_ID, colOf, idx, ROWS, rowOf } from "./config";
import { panBy, screenToCell, setHover, zoomAtPoint } from "./render";
import { markDirty, state } from "./state";
import type { BuildingId, Material } from "./types";
import { openInfo, toast } from "./view";

let canvas: HTMLCanvasElement;
const pointers = new Map<number, { x: number; y: number }>();
let panId: number | null = null;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let moved = false;
let pinchDist = 0;

function pt(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function initInput(cv: HTMLCanvasElement): void {
  canvas = cv;
  canvas.style.touchAction = "none";

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = pt(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      panId = null;
      return;
    }
    panId = e.pointerId;
    startX = lastX = p.x;
    startY = lastY = p.y;
    moved = false;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pt(e);
    pointers.set(e.pointerId, p);

    if (pointers.size >= 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      zoomAtPoint(mx, my, dist / pinchDist);
      pinchDist = dist;
      return;
    }

    if (state.tool === "build") setHover(screenToCell(p.x, p.y));

    if (panId === e.pointerId) {
      const dx = p.x - lastX;
      const dy = p.y - lastY;
      if (!moved && Math.hypot(p.x - startX, p.y - startY) > 8) moved = true;
      if (moved) panBy(dx, dy);
      lastX = p.x;
      lastY = p.y;
    }
  });

  const end = (e: PointerEvent): void => {
    if (pointers.has(e.pointerId)) pointers.delete(e.pointerId);
    if (panId === e.pointerId) {
      if (!moved) {
        const p = pt(e);
        const i = screenToCell(p.x, p.y);
        if (i >= 0) onTap(i);
      }
      panId = null;
    }
    if (pointers.size < 2) pinchDist = 0;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = pt(e);
      zoomAtPoint(p.x, p.y, e.deltaY < 0 ? 1.1 : 0.9);
    },
    { passive: false },
  );
}

function onTap(i: number): void {
  const t = state.grid[i];
  if (state.tool === "dig") {
    if (t.build) openInfo(i);
    else if (t.solid !== null) toggleMark(i);
  } else if (state.tool === "build") {
    if (t.build || t.blueprint) openInfo(i);
    else {
      const why = placeReason(i, state.buildSel);
      if (why) toast(why);
      else setBlueprint(i, state.buildSel);
    }
  } else {
    // cancel tool
    if (t.build || t.blueprint) removeBuilding(i);
    else if (t.marked) unmark(i);
  }
  markDirty();
}

// --- player actions --------------------------------------------------------
export function toggleMark(i: number): void {
  const t = state.grid[i];
  if (t.solid === null) return;
  if (t.marked) {
    t.marked = false;
    t.digProgress = 0;
  } else {
    t.marked = true;
  }
}

export function unmark(i: number): void {
  const t = state.grid[i];
  t.marked = false;
  t.digProgress = 0;
}

function floorOk(i: number): boolean {
  const r = rowOf(i);
  if (r >= ROWS - 1) return true; // bottom edge counts as floor
  return state.grid[idx(colOf(i), r + 1)].solid !== null;
}

export function canAfford(id: BuildingId): boolean {
  const def = BUILD_BY_ID[id];
  for (const m in def.cost) {
    if (state.stock[m as Material] < (def.cost[m as Material] as number)) return false;
  }
  return true;
}

/** Returns an i18n reason key if the building can't be placed, else "". */
export function placeReason(i: number, id: BuildingId): string {
  const t = state.grid[i];
  if (t.solid !== null) return "needSpace";
  if (t.build || t.blueprint) return "needSpace";
  if (BUILD_BY_ID[id].floor && !floorOk(i)) return "needFloor";
  if (!canAfford(id)) return "needMat";
  return "";
}

export function setBlueprint(i: number, id: BuildingId): void {
  const t = state.grid[i];
  t.blueprint = id;
  t.buildProgress = 0;
}

export function removeBuilding(i: number): void {
  const t = state.grid[i];
  t.build = null;
  t.blueprint = null;
  t.buildProgress = 0;
  t.on = false;
  if (state.selCell === i) state.selCell = null;
}

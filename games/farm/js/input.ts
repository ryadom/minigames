/* ============================================================================
 *  Farm — the world-view controller (scale, pan & input).
 *
 *  Keeps the world scaled to cover the viewport and lets the player drag it
 *  around. Owns the pointer pipeline: a press on open land pans; a press on a
 *  field tile or a pen animal starts a hold-and-sweep "paint" gesture that
 *  tends each cell entered. Also delegates taps to `handle()` (the action
 *  layer) and shows the one-time "drag to look around" hint.
 *
 *  `initInput()` wires the listeners at boot (called from main.ts).
 * ========================================================================== */
import { MG } from "../../../shared/mg";
import { actAnimal, actPlot, flushAgg, freshAgg, handle } from "./actions";
import { dom } from "./runtime";
import { WORLD_H, WORLD_W } from "./scene";
import { markDirty, save, state } from "./state";
import type { Agg } from "./types";
import { patch, render, syncStats, updateAnimCell } from "./view";

// DOM refs, resolved at init.
let worldView: HTMLElement;
let world: HTMLElement;
let toolbarEl: HTMLElement;
let overlay: HTMLElement;
let panHint: HTMLElement;

/* ======================================================================
 *  PAN / SCALE — keep the world covering the viewport, allow dragging.
 * ==================================================================== */
let tx = 0;
let ty = 0;
let scale = 1;
let scaledW = 0;
let scaledH = 0;
let centered = false;

export function ensureScale(): void {
  const vw = worldView.clientWidth;
  const vh = worldView.clientHeight;
  if (!vw || !vh) return;
  scale = Math.max(vw / WORLD_W, vh / WORLD_H);
  scaledW = WORLD_W * scale;
  scaledH = WORLD_H * scale;
  if (!centered) {
    tx = (vw - scaledW) / 2;
    ty = (vh - scaledH) / 2;
    centered = true;
  }
  clampPan();
}
function clampPan(): void {
  const vw = worldView.clientWidth;
  const vh = worldView.clientHeight;
  // Reserve room at the bottom for the floating toolbar so the lowest
  // crop tiles and pens can always be panned out from under it.
  const inset = toolbarEl ? toolbarEl.offsetHeight : 0;
  const minX = vw - scaledW;
  const minY = vh - scaledH - inset;
  if (tx > 0) tx = 0;
  if (tx < minX) tx = minX;
  if (ty > 0) ty = 0;
  if (ty < minY) ty = minY;
}
export function applyWorld(): void {
  world.style.width = `${scaledW}px`;
  world.style.height = `${scaledH}px`;
  world.style.transform = `translate(${Math.round(tx)}px,${Math.round(ty)}px)`;
}

/* ======================================================================
 *  PANNING (pointer) + CLICK DELEGATION
 * ==================================================================== */
let panId: number | null = null;
let panStartX = 0;
let panStartY = 0;
let panTx0 = 0;
let panTy0 = 0;
let dragging = false;
let suppressClick = false;

// A "paint" gesture: holding on a field tile or an animal and sweeping
// across more of them performs the action on each one entered — no
// per-tile clicking. Pressing on open land pans the map as before.
let paintMode: "field" | "pen" | null = null;
let paintId: number | null = null;
let paintVisited: Record<string, boolean> | null = null;
let paintAgg: Agg | null = null;
// A pen press waits to see what it is: a tap opens that pen's panel, a
// sweep tends the animals by hand. We don't act until movement crosses a
// small threshold, so a clean tap never collects/feeds by accident.
let penGesture: { type: string | null; x: number; y: number; moved: boolean } | null = null;

// Whether the player is mid-pan or mid-sweep — the tick loop uses this to
// hold off full re-renders so the gesture stays smooth.
export function isInteracting(): boolean {
  return dragging || paintMode !== null;
}

function startPaint(mode: "field" | "pen", e: PointerEvent): void {
  paintMode = mode;
  paintId = e.pointerId;
  paintVisited = {};
  paintAgg = freshAgg();
  try {
    worldView.setPointerCapture(paintId);
  } catch (_err) {}
  hidePanHint();
}
// Act on whatever interactive cell sits under the pointer, once per cell.
function paintAt(cx: number, cy: number): void {
  const el = document.elementFromPoint(cx, cy);
  if (!el?.closest) return;
  if (paintMode === "field") {
    const cell = el.closest("[data-plotcell]");
    if (cell?.getAttribute("data-act") !== "plot") return;
    const i = +(cell.getAttribute("data-plotcell") as string);
    if ((paintVisited as Record<string, boolean>)[`f${i}`]) return;
    (paintVisited as Record<string, boolean>)[`f${i}`] = true;
    if (actPlot(i, paintAgg as Agg)) {
      patch();
      syncStats();
    }
  } else if (paintMode === "pen") {
    const ac = el.closest("[data-animcell]");
    if (!ac) return;
    const j = +(ac.getAttribute("data-animcell") as string);
    if ((paintVisited as Record<string, boolean>)[`a${j}`]) return;
    (paintVisited as Record<string, boolean>)[`a${j}`] = true;
    if (actAnimal(j, paintAgg as Agg)) {
      updateAnimCell(ac, j);
      syncStats();
    }
  }
}
function endPaint(): void {
  if (paintMode === null) return;
  const agg = paintAgg;
  const mode = paintMode;
  const pg = penGesture;
  paintMode = null;
  paintId = null;
  paintVisited = null;
  paintAgg = null;
  penGesture = null;
  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 0);
  // A pen press that never moved is a tap → open that pen's panel.
  if (mode === "pen" && pg && !pg.moved) {
    if (pg.type) {
      state.tab = "pen";
      state.penType = pg.type;
      markDirty();
      render();
    }
    return;
  }
  flushAgg(agg);
  save();
  render();
}

function onPointerDown(e: PointerEvent): void {
  const target = e.target as Element;
  if (target.closest?.("#toolbar")) return; // let the toolbar scroll/tap
  const plotCell = target.closest?.("[data-plotcell]");
  const animCell = target.closest?.("[data-animcell]");
  if (plotCell && plotCell.getAttribute("data-act") === "plot") {
    startPaint("field", e);
    paintAt(e.clientX, e.clientY);
    return;
  }
  if (animCell) {
    const aIdx = +(animCell.getAttribute("data-animcell") as string);
    const animal = state.animals[aIdx];
    penGesture = { type: animal ? animal.type : null, x: e.clientX, y: e.clientY, moved: false };
    startPaint("pen", e); // defer: act only once a sweep is detected
    return;
  }
  panId = e.pointerId;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panTx0 = tx;
  panTy0 = ty;
  dragging = false;
}
function onPointerMove(e: PointerEvent): void {
  if (paintMode !== null && e.pointerId === paintId) {
    if (paintMode === "pen" && penGesture && !penGesture.moved) {
      if (Math.abs(e.clientX - penGesture.x) + Math.abs(e.clientY - penGesture.y) <= 6) return;
      penGesture.moved = true;
      paintAt(penGesture.x, penGesture.y); // tend the cell the press started on
    }
    paintAt(e.clientX, e.clientY);
    return;
  }
  if (panId === null || e.pointerId !== panId) return;
  const dx = e.clientX - panStartX;
  const dy = e.clientY - panStartY;
  if (!dragging && Math.abs(dx) + Math.abs(dy) > 6) {
    dragging = true;
    worldView.classList.add("drag");
    try {
      worldView.setPointerCapture(panId);
    } catch (_err) {}
    hidePanHint();
  }
  if (dragging) {
    tx = panTx0 + dx;
    ty = panTy0 + dy;
    clampPan();
    world.style.transform = `translate(${Math.round(tx)}px,${Math.round(ty)}px)`;
  }
}
function endPan(): void {
  if (panId === null) return;
  if (dragging) {
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
  }
  worldView.classList.remove("drag");
  panId = null;
  dragging = false;
}

function onWorldClick(e: MouseEvent): void {
  if (suppressClick) return;
  let t = e.target as HTMLElement | null;
  while (t && t !== worldView && !t.dataset.act) t = t.parentNode as HTMLElement | null;
  if (!t || t === worldView) return;
  handle(t.dataset.act as string, t.dataset.arg);
}
function onOverlayClick(e: MouseEvent): void {
  if (e.target === overlay) {
    handle("close");
    return;
  }
  let t = e.target as HTMLElement | null;
  while (t && t !== overlay && !t.dataset.act) t = t.parentNode as HTMLElement | null;
  if (!t || t === overlay) return;
  handle(t.dataset.act as string, t.dataset.arg);
}

/* ---- One-time "drag to look around" hint. ---- */
let hintTimer: ReturnType<typeof setTimeout> | null = null;
export function hidePanHint(): void {
  panHint.classList.remove("show");
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
}
export function showPanHint(): void {
  panHint.textContent = MG.i18n.t("dragHint");
  panHint.classList.add("show");
  hintTimer = setTimeout(hidePanHint, 4000);
}

/** Resolve DOM refs and wire the pointer pipeline (called from main.ts). */
export function initInput(): void {
  worldView = dom.worldView;
  world = dom.world;
  toolbarEl = dom.toolbar;
  overlay = dom.overlay;
  panHint = dom.panHint;

  worldView.addEventListener("pointerdown", onPointerDown);
  worldView.addEventListener("pointermove", onPointerMove);
  worldView.addEventListener("pointerup", () => {
    endPaint();
    endPan();
  });
  worldView.addEventListener("pointercancel", () => {
    endPaint();
    endPan();
  });
  worldView.addEventListener("click", onWorldClick);
  overlay.addEventListener("click", onOverlayClick);
}

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
import { actPlot, flushAgg, freshAgg, handle } from "./actions";
import { dom } from "./runtime";
import { WORLD_H, WORLD_W } from "./scene";
import { save } from "./state";
import type { Agg } from "./types";
import { patch, render, syncStats } from "./view";

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
// `coverScale` is the smallest scale that still covers the viewport; the player
// can zoom in on top of it via `userZoom`. `scale` is always their product.
const MAX_ZOOM = 3;
let coverScale = 1;
let userZoom = 1;
let scale = 1;
let scaledW = 0;
let scaledH = 0;
let centered = false;

const clampZoom = (z: number): number => (z < 1 ? 1 : z > MAX_ZOOM ? MAX_ZOOM : z);

export function ensureScale(): void {
  const vw = worldView.clientWidth;
  const vh = worldView.clientHeight;
  if (!vw || !vh) return;
  coverScale = Math.max(vw / WORLD_W, vh / WORLD_H);
  scale = coverScale * userZoom;
  scaledW = WORLD_W * scale;
  scaledH = WORLD_H * scale;
  if (!centered) {
    tx = (vw - scaledW) / 2;
    ty = (vh - scaledH) / 2;
    centered = true;
  }
  clampPan();
}

// Zoom toward a screen point (relative to the world-view), keeping whatever
// world coordinate sits under it pinned in place.
function zoomAt(px: number, py: number, nextZoom: number): void {
  const wx = (px - tx) / scale;
  const wy = (py - ty) / scale;
  userZoom = clampZoom(nextZoom);
  scale = coverScale * userZoom;
  scaledW = WORLD_W * scale;
  scaledH = WORLD_H * scale;
  tx = px - wx * scale;
  ty = py - wy * scale;
  clampPan();
  applyWorld();
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

// A "paint" gesture: holding on a soil tile and sweeping across more of them
// tends each one entered — no per-tile clicking. Pressing on open land (or in
// build mode) pans the map instead.
let painting = false;
let paintId: number | null = null;
let paintVisited: Record<string, boolean> | null = null;
let paintAgg: Agg | null = null;

// Two-finger pinch-to-zoom. We track every active pointer; the moment a second
// one lands we drop any pan / paint gesture and scale around the midpoint.
const pointers = new Map<number, { x: number; y: number }>();
let pinching = false;
let pinchStartDist = 0;
let pinchStartZoom = 1;
let pinchWX = 0;
let pinchWY = 0;

// Whether the player is mid-pan / mid-sweep / mid-pinch — the tick loop uses
// this to hold off full re-renders so the gesture stays smooth.
export function isInteracting(): boolean {
  return dragging || painting || pinching;
}

function startPinch(): void {
  // Abandon any pan / paint gesture in favour of the two-finger zoom.
  endPaint();
  endPan();
  pinching = true;
  const pts = Array.from(pointers.values());
  const r = worldView.getBoundingClientRect();
  pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
  pinchStartZoom = userZoom;
  const mx = (pts[0].x + pts[1].x) / 2 - r.left;
  const my = (pts[0].y + pts[1].y) / 2 - r.top;
  pinchWX = (mx - tx) / scale;
  pinchWY = (my - ty) / scale;
  hidePanHint();
}

function movePinch(): void {
  const pts = Array.from(pointers.values());
  const r = worldView.getBoundingClientRect();
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
  const mx = (pts[0].x + pts[1].x) / 2 - r.left;
  const my = (pts[0].y + pts[1].y) / 2 - r.top;
  userZoom = clampZoom(pinchStartZoom * (dist / pinchStartDist));
  scale = coverScale * userZoom;
  scaledW = WORLD_W * scale;
  scaledH = WORLD_H * scale;
  tx = mx - pinchWX * scale;
  ty = my - pinchWY * scale;
  clampPan();
  applyWorld();
}

function endPinch(): void {
  pinching = false;
  // Swallow the click the lifted fingers would otherwise synthesise.
  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 0);
}

function startPaint(e: PointerEvent): void {
  painting = true;
  paintId = e.pointerId;
  paintVisited = {};
  paintAgg = freshAgg();
  try {
    worldView.setPointerCapture(paintId);
  } catch (_err) {}
  hidePanHint();
}
// Tend whatever soil tile sits under the pointer, once per cell.
function paintAt(cx: number, cy: number): void {
  const el = document.elementFromPoint(cx, cy);
  if (!el?.closest) return;
  const cell = el.closest("[data-plotcell]");
  if (cell?.getAttribute("data-act") !== "plot") return;
  const i = +(cell.getAttribute("data-plotcell") as string);
  if ((paintVisited as Record<string, boolean>)[`f${i}`]) return;
  (paintVisited as Record<string, boolean>)[`f${i}`] = true;
  if (actPlot(i, paintAgg as Agg)) {
    patch();
    syncStats();
  }
}
function endPaint(): void {
  if (!painting) return;
  const agg = paintAgg;
  painting = false;
  paintId = null;
  paintVisited = null;
  paintAgg = null;
  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 0);
  flushAgg(agg);
  save();
  render();
}

function onPointerDown(e: PointerEvent): void {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    startPinch();
    return;
  }
  const target = e.target as Element;
  if (target.closest?.("#toolbar")) return; // let the toolbar scroll/tap
  const plotCell = target.closest?.("[data-plotcell]");
  if (plotCell && plotCell.getAttribute("data-act") === "plot") {
    startPaint(e);
    paintAt(e.clientX, e.clientY);
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
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinching) {
    movePinch();
    return;
  }
  if (painting && e.pointerId === paintId) {
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

  const onPointerUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pinching) {
      if (pointers.size < 2) endPinch();
      return;
    }
    endPaint();
    endPan();
  };

  worldView.addEventListener("pointerdown", onPointerDown);
  worldView.addEventListener("pointermove", onPointerMove);
  worldView.addEventListener("pointerup", onPointerUp);
  worldView.addEventListener("pointercancel", onPointerUp);
  // Desktop parity for pinch-to-zoom: wheel scrolls into / out of the map.
  worldView.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      e.preventDefault();
      const r = worldView.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(e.clientX - r.left, e.clientY - r.top, userZoom * factor);
    },
    { passive: false },
  );
  worldView.addEventListener("click", onWorldClick);
  overlay.addEventListener("click", onOverlayClick);
}

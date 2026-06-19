/* ============================================================================
 *  Farm — the view layer (everything that produces DOM / HTML).
 *
 *  Renders the pannable world as a tile grid. In normal play each cell shows
 *  whatever is built on it — a soil plot you tend, or a shop / pen you tap to
 *  open. In build mode every cell becomes a placement target and the toolbar
 *  swaps to the build catalog. The sliding building panels (market, kitchen,
 *  greenhouse, apiary, pens, orders) are unchanged. `render()` rebuilds the
 *  world and the open panel; `patch()` does the cheap per-frame updates;
 *  `syncStats()` keeps the header / status strip honest; `toast()` shows the
 *  transient message bubble.
 * ========================================================================== */
import { MG } from "../../../shared/mg";
import {
  $,
  ANIMAL_BY_ID,
  APIARY_LVL,
  BUILD_BY_ID,
  BUILDS,
  CROP_BY_ID,
  CROPS,
  DISH_BY_ID,
  DISHES,
  esc,
  FEEDER_CAP,
  FERT_COST,
  FLOWER_BY_ID,
  FLOWERS,
  GRID_N,
  HEATER_STEP,
  HIVE_MS,
  ITEM,
  MAX_HEATER,
  MAX_HIVES,
  MAX_OVEN,
  MAX_PER_ANIMAL,
  MAX_POTS,
  MAX_SOIL,
  MAX_SPRINKLER,
  MAX_TRADE,
  MOVE_TOOL,
  OVEN_STEP,
  REMOVE_TOOL,
  SOIL_STEP,
  TRADE_STEP,
} from "./config";
import {
  capCost,
  collectorCost,
  feederCost,
  hasRecipe,
  heaterCost,
  hiveCost,
  invCount,
  isUnlocked,
  ovenCost,
  potCost,
  price,
  soilCost,
  soilTileCost,
  sprinklerCost,
  stk,
  stoveCost,
  tradeCost,
} from "./economy";
import { itemName as name, tf } from "./i18n";
import { applyWorld, ensureScale } from "./input";
import { dom, ui } from "./runtime";
import { buildScene, cellPos, pf, TILE, WORLD_H, WORLD_W } from "./scene";
import { animalSprite, buildArtById, buildingArt, cropArt, cropStage } from "./sprites";
import { buildFits, ensurePen, need, state } from "./state";
import type { BuildDef, Tile } from "./types";

// Buildings you can step into; each opens as a sliding panel.
const PANELS: Record<string, { ico: string; title: string }> = {
  market: { ico: "🏪", title: "tabMarket" },
  storage: { ico: "📦", title: "tabStorage" },
  research: { ico: "🔬", title: "tabResearch" },
  pen: { ico: "🐄", title: "" },
  cook: { ico: "🍳", title: "tabCook" },
  greenhouse: { ico: "🌻", title: "tabGreenhouse" },
  apiary: { ico: "🐝", title: "tabApiary" },
  quests: { ico: "📋", title: "tabQuests" },
};
let overlayTab: string | null = null;
let overlayPenType: string | undefined;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(msg: string): void {
  dom.toast.textContent = msg;
  dom.toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 1500);
}

export function syncStats(): void {
  ui.setStat("coins", state.coins);
  ui.setStat("level", state.level);
  dom.lvl.textContent = `⭐ ${state.level}`;
  dom.xpfill.style.width = `${Math.min(100, (state.xp / need(state.level)) * 100)}%`;
  const n = invCount();
  dom.store.textContent = `📦 ${n}/${state.cap}`;
  dom.store.classList.toggle("full", n >= state.cap);
}

/* ----------------------------- GRID CELLS ---------------------------- */
// Absolute-position a cell (or a `cw`×`ch` building footprint) over the world.
function cellStyle(i: number, cw = 1, ch = 1): string {
  const p = cellPos(i);
  const left = (p.x / WORLD_W) * 100;
  const top = (p.y / WORLD_H) * 100;
  const w = ((cw * TILE) / WORLD_W) * 100;
  const h = ((ch * TILE) / WORLD_H) * 100;
  return `style="left:${pf(left)}%;top:${pf(top)}%;width:${pf(w)}%;height:${pf(h)}%"`;
}

// The icon a tile shows at a glance (its crop when grown, else its emblem).
function tileIcon(t: Tile): string {
  if (t.kind === "soil") return t.crop ? CROP_BY_ID[t.crop].ico : "🟫";
  if (t.kind === "pen") return ANIMAL_BY_ID[t.penType as string]?.ico || "🐄";
  return BUILD_BY_ID[t.kind]?.ico || "🏠";
}

// The growth stage (0..3) a crop tile is in, or -1 when the plot is bare.
function plotStage(t: Tile): number {
  if (!t.crop) return -1;
  return cropStage(t.grown || 0, CROP_BY_ID[t.crop].grow);
}

// A soil plot you can plant / water / harvest (normal play).
function soilCell(i: number, t: Tile): string {
  let cls = "plot";
  let spr = "";
  let w = "0";
  const stage = plotStage(t);
  if (t.crop) {
    const c = CROP_BY_ID[t.crop];
    const rdy = (t.grown || 0) >= c.grow;
    cls += rdy ? " ready" : (t.water || 0) > 0 ? " watered" : "";
    if (t.fert) cls += " fert";
    spr = cropArt(t.crop, stage as 0 | 1 | 2 | 3);
    w = Math.min(100, ((t.grown || 0) / c.grow) * 100).toFixed(1);
  } else {
    cls += " empty";
  }
  return (
    `<button class="${cls}" data-plotcell="${i}" data-stage="${stage}" data-act="plot" data-arg="${i}" ${cellStyle(i)}>` +
    `<span class="sprite">${spr}</span>` +
    `<span class="bar"><i style="width:${w}%"></i></span></button>`
  );
}

// A shop / pen tile: a big emblem + a placard with a live status line.
function buildingCell(i: number, t: Tile): string {
  const rc = readyCounts();
  let act = "open";
  let arg: string = t.kind;
  let ico = tileIcon(t);
  let title = "";
  let sub = "";
  let badge: string | number = "";
  if (t.kind === "market") {
    title = MG.i18n.t("tabMarket");
    sub = `🪙 ${state.coins}`;
  } else if (t.kind === "storage") {
    title = MG.i18n.t("tabStorage");
    const n = invCount();
    sub = `📦 ${n}/${state.cap}`;
  } else if (t.kind === "research") {
    title = MG.i18n.t("tabResearch");
    const avail = researchAvail();
    sub = `🔬 ${avail}/${RESEARCH_TOTAL}`;
    badge = avail || "";
  } else if (t.kind === "board") {
    arg = "quests";
    title = MG.i18n.t("tabQuests");
    sub = `🎁 ${rc.fillable}/${state.quests.length}`;
    badge = rc.fillable || "";
  } else if (t.kind === "kitchen") {
    arg = "cook";
    title = MG.i18n.t("tabCook");
    sub = cookStatus();
    badge = rc.cook || "";
  } else if (t.kind === "greenhouse") {
    title = MG.i18n.t("tabGreenhouse");
    sub = greenhouseStatus();
    badge = rc.pot || "";
  } else if (t.kind === "apiary") {
    title = MG.i18n.t("tabApiary");
    sub = apiaryStatus();
    badge = rc.hive || "";
  } else if (t.kind === "pen") {
    const type = t.penType as string;
    const def = ANIMAL_BY_ID[type];
    act = "openpen";
    arg = type;
    ico = def.ico;
    title = name(type);
    let mine = 0;
    let ready = 0;
    state.animals.forEach((a) => {
      if (a.type === type) {
        mine++;
        if (a.grown >= def.interval) ready++;
      }
    });
    sub = mine ? `${ITEM[def.prod].ico} ×${mine}` : "🛒";
    badge = ready || "";
  }
  const art = buildingArt(t);
  // Buildings (pens included) are pure drawn art; a pen's animals roam on top
  // of its paddock, drawn separately in the persistent livestock layer.
  const emblem = art
    ? `<span class="bld-art">${art}</span>`
    : `<span class="bld-ico">${ico}</span>`;
  return (
    `<button class="hotspot bld" data-act="${act}" data-arg="${arg}" ${cellStyle(i, t.w || 1, t.h || 1)}>` +
    (badge ? `<span class="b-badge">${badge}</span>` : "") +
    emblem +
    `<span class="sign"><span class="st">${esc(title)}</span>` +
    (sub ? `<span class="ss">${esc(sub)}</span>` : "") +
    `</span></button>`
  );
}

// A build-mode placement target. Occupied roots render across their whole
// footprint (so a 2×2 / 3×3 building reads as one block); empty cells are a
// single-cell "＋". Link cells are covered by their root and skipped upstream.
function buildCell(i: number): string {
  const t = state.grid[i];
  const removing = state.buildSel === REMOVE_TOOL;
  const moving = state.buildSel === MOVE_TOOL;
  const cw = t?.w || 1;
  const ch = t?.h || 1;
  let inner = `<span class="bc-plus">＋</span>`;
  if (t) {
    const art =
      t.kind === "soil" ? "" : buildArtById(t.kind === "pen" ? `pen-${t.penType}` : t.kind);
    inner = art
      ? `<span class="bc-art">${art}</span>`
      : `<span class="bc-ico">${tileIcon(t)}</span>`;
  }
  // Move tool: flag movable buildings, and lift the one currently picked up.
  let edit = "";
  if (removing && t) edit = " rm";
  else if (moving && t) edit = state.moveSrc === i ? " picked" : " movable";
  return (
    `<button class="buildcell${t ? " filled" : " open"}${edit}" ` +
    `data-act="buildcell" data-arg="${i}" ${cellStyle(i, cw, ch)}>${inner}</button>`
  );
}

// Can the selected build be committed at cell `i` right now? (unlocked, not a
// duplicate of a unique build, footprint clear & in bounds, and affordable.)
// Drives the placement ghost's valid / blocked styling.
function placeValid(b: BuildDef, i: number): boolean {
  if (!isUnlocked(b.lvl)) return false;
  if (b.unique && isPlaced(b)) return false;
  if (!buildFits(state.grid, i, b.w, b.h)) return false;
  const cost = b.id === "soil" ? soilTileCost() : b.cost;
  return state.coins >= cost;
}

// The pending placement preview: a movable ghost of the selected build. Tapping
// it confirms (data-act placeok); the corner ✕ cancels; tapping any other cell
// repositions it. Coloured green when it can be placed, red when blocked.
function placeGhost(): string {
  if (!state.build || state.placeAt == null) return "";
  const b = BUILD_BY_ID[state.buildSel];
  if (!b) return "";
  const i = state.placeAt;
  const ok = placeValid(b, i);
  const art = b.id === "soil" ? "" : buildArtById(b.id);
  const inner = art ? `<span class="bc-art">${art}</span>` : `<span class="bc-ico">${b.ico}</span>`;
  return (
    `<div class="placeghost ${ok ? "ok" : "bad"}" data-act="placeok" ${cellStyle(i, b.w, b.h)}>` +
    inner +
    `<span class="pg-badge">${ok ? "✓" : "✖"}</span>` +
    `<button class="pg-x" data-act="placecancel" aria-label="cancel">✕</button>` +
    "</div>"
  );
}

// Has this unique build already been placed somewhere on the grid?
function isPlaced(b: BuildDef): boolean {
  if (b.pen) return state.grid.some((t) => t && t.kind === "pen" && t.penType === b.pen);
  return state.grid.some((t) => t && t.kind === b.id);
}

function buildName(b: BuildDef): string {
  if (b.pen) return name(b.pen);
  if (b.id === "soil") return MG.i18n.t("bSoil");
  if (b.id === "market") return MG.i18n.t("tabMarket");
  if (b.id === "storage") return MG.i18n.t("tabStorage");
  if (b.id === "research") return MG.i18n.t("tabResearch");
  if (b.id === "board") return MG.i18n.t("tabQuests");
  if (b.id === "kitchen") return MG.i18n.t("tabCook");
  if (b.id === "greenhouse") return MG.i18n.t("tabGreenhouse");
  if (b.id === "apiary") return MG.i18n.t("tabApiary");
  return b.id;
}

/* ----------------------------- TOOLBARS ------------------------------ */
// The seed / tool selector (normal play) or the build catalog (build mode),
// always led by the build-mode toggle.
function renderToolbar(): string {
  let h =
    `<button class="tool mode${state.build ? " on" : ""}" data-act="mode">` +
    `<span class="ico">${state.build ? "✅" : "🔨"}</span>` +
    `<span class="name">${esc(MG.i18n.t(state.build ? "modeDone" : "modeBuild"))}</span></button>`;

  if (state.build) {
    BUILDS.forEach((b) => {
      const lock = !isUnlocked(b.lvl);
      const placed = b.unique && isPlaced(b);
      const sel = state.buildSel === b.id ? " selected" : "";
      const cost = b.id === "soil" ? soilTileCost() : b.cost;
      const costLabel = lock
        ? `🔒 ${tf("lvl", { n: b.lvl })}`
        : placed
          ? esc(MG.i18n.t("placed"))
          : cost > 0
            ? `🪙 ${cost}`
            : "·";
      h +=
        `<button class="tool${sel}${lock || placed ? " locked" : ""}" data-act="buildsel" data-arg="${b.id}">` +
        `<span class="ico">${b.ico}</span>` +
        `<span class="name">${esc(buildName(b))}</span>` +
        `<span class="cost${lock ? " lock" : ""}">${costLabel}</span></button>`;
    });
    h +=
      `<button class="tool${state.buildSel === MOVE_TOOL ? " selected" : ""}" data-act="buildsel" data-arg="${MOVE_TOOL}">` +
      `<span class="ico">✋</span><span class="name">${esc(MG.i18n.t("bMove"))}</span>` +
      `<span class="cost">·</span></button>`;
    h +=
      `<button class="tool${state.buildSel === REMOVE_TOOL ? " selected" : ""}" data-act="buildsel" data-arg="${REMOVE_TOOL}">` +
      `<span class="ico">🚮</span><span class="name">${esc(MG.i18n.t("bRemove"))}</span>` +
      `<span class="cost">·</span></button>`;
    return h;
  }

  CROPS.forEach((c) => {
    const lock = !isUnlocked(c.lvl);
    const sel = state.sel === c.id ? " selected" : "";
    h +=
      `<button class="tool${sel}${lock ? " locked" : ""}" data-act="seed" data-arg="${c.id}">` +
      `<span class="ico">${c.ico}</span>` +
      `<span class="name">${esc(name(c.id))}</span>` +
      (lock
        ? `<span class="cost lock">🔒 ${tf("lvl", { n: c.lvl })}</span>`
        : `<span class="cost">🪙 ${c.seed}</span>`) +
      stk(c.id) +
      "</button>";
  });
  h +=
    `<button class="tool${state.sel === "water" ? " selected" : ""}" data-act="seed" data-arg="water">` +
    `<span class="ico">💧</span><span class="name">${esc(MG.i18n.t("water"))}</span><span class="cost">·</span></button>`;
  h +=
    `<button class="tool${state.sel === "fert" ? " selected" : ""}" data-act="seed" data-arg="fert">` +
    `<span class="ico">💩</span><span class="name">${esc(MG.i18n.t("fert"))}</span><span class="cost">🪙 ${FERT_COST}</span></button>`;
  h +=
    `<button class="tool${state.sel === "clear" ? " selected" : ""}" data-act="seed" data-arg="clear">` +
    `<span class="ico">🧺</span><span class="name">${esc(MG.i18n.t("clear"))}</span><span class="cost">·</span></button>`;
  return h;
}

/* ======================================================================
 *  LIVESTOCK — animals that roam their pens, each walking independently.
 *
 *  The world is rebuilt (`innerHTML`) roughly once a second, which would
 *  restart any CSS animation on a pen's animal every render — so instead the
 *  animals live in their own persistent layer that survives re-renders (it is
 *  re-appended, not recreated). Each owned animal gets its own sprite and a
 *  small random-walk state machine (`stepLivestock`), so they wander, pause and
 *  turn to face their way independently rather than marching in lock-step.
 * ==================================================================== */

// How many animals of a pen are actually drawn roaming (the rest are implied);
// capped so a 2×2 paddock doesn't get visually overcrowded.
const MAX_ROAMING = 8;

// Per-type look & gait: sprite width as a fraction of a tile, and walk speed
// in world units per millisecond (smaller, heavier animals amble slower).
const ANIMAL_VIEW: Record<string, { size: number; speed: number }> = {
  chicken: { size: 0.42, speed: 0.02 },
  cow: { size: 0.62, speed: 0.011 },
  sheep: { size: 0.54, speed: 0.013 },
  pig: { size: 0.58, speed: 0.012 },
};

interface Walker {
  el: HTMLElement; // outer positioned element (left/top set in world %)
  face: HTMLElement; // inner element flipped (scaleX) to face the walk way
  // Roam bounds (world units) — the grassy interior of the pen's footprint.
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  x: number;
  y: number; // current position (world units)
  tx: number;
  ty: number; // current target
  dir: number; // 1 faces right, -1 faces left
  phase: 0 | 1; // 0 = walking to target, 1 = resting
  timer: number; // ms left to rest
  speed: number;
  init: boolean; // has it been placed inside its pen yet?
}

let livestockLayer: HTMLElement | null = null;
let livestockShown = false;
const walkers = new Map<string, Walker>();
const reduceMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function ensureLivestockLayer(): HTMLElement {
  if (!livestockLayer) {
    livestockLayer = document.createElement("div");
    livestockLayer.className = "livestock";
    livestockLayer.setAttribute("aria-hidden", "true");
  }
  return livestockLayer;
}

// The grassy interior of a pen rooted at `cell`, inset so a `sizeU`-wide sprite
// stays on the grass rather than walking through the fence.
function penRoam(
  cell: number,
  w: number,
  h: number,
  sizeU: number,
): { x0: number; x1: number; y0: number; y1: number } {
  const p = cellPos(cell);
  const fw = w * TILE;
  const fh = h * TILE;
  const half = sizeU / 2;
  return {
    x0: p.x + fw * 0.2 + half,
    x1: p.x + fw * 0.8 - half,
    y0: p.y + fh * 0.5 + half,
    y1: p.y + fh * 0.82 - half,
  };
}

function newWalker(type: string, sizeU: number): Walker {
  const el = document.createElement("div");
  el.className = "lw";
  el.style.width = `${(sizeU / WORLD_W) * 100}%`;
  const face = document.createElement("div");
  face.className = "lw-face";
  const hop = document.createElement("div");
  hop.className = "lw-hop";
  // Per-animal hop timing so their little bounces never sync up.
  hop.style.animationDuration = `${rand(0.42, 0.62).toFixed(2)}s`;
  hop.style.animationDelay = `${rand(-0.6, 0).toFixed(2)}s`;
  hop.innerHTML = animalSprite(type);
  face.appendChild(hop);
  el.appendChild(face);
  return {
    el,
    face,
    x0: 0,
    x1: 0,
    y0: 0,
    y1: 0,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    dir: 1,
    phase: 1,
    timer: 0,
    speed: ANIMAL_VIEW[type]?.speed || 0.013,
    init: false,
  };
}

function applyWalker(w: Walker): void {
  w.el.style.left = `${((w.x / WORLD_W) * 100).toFixed(2)}%`;
  w.el.style.top = `${((w.y / WORLD_H) * 100).toFixed(2)}%`;
  w.face.style.transform = `scaleX(${w.dir})`;
}

// Reconcile the roaming sprites against the pens currently on the grid: one
// sprite per owned animal (up to MAX_ROAMING), created / removed as pens and
// herds change, and re-homed when a pen is moved.
function syncLivestock(): void {
  const layer = ensureLivestockLayer();
  const want = new Set<string>();
  for (let i = 0; i < GRID_N; i++) {
    const t = state.grid[i];
    if (t?.kind !== "pen" || !t.penType) continue;
    const type = t.penType;
    const cfg = ANIMAL_VIEW[type];
    if (!cfg) continue;
    const sizeU = cfg.size * TILE;
    const b = penRoam(i, t.w || 2, t.h || 2, sizeU);
    let count = 0;
    for (const a of state.animals) if (a.type === type) count++;
    const show = Math.min(count, MAX_ROAMING);
    for (let n = 0; n < show; n++) {
      const key = `${type}#${n}`;
      want.add(key);
      let w = walkers.get(key);
      if (!w) {
        w = newWalker(type, sizeU);
        walkers.set(key, w);
        layer.appendChild(w.el);
      }
      w.x0 = b.x0;
      w.x1 = b.x1;
      w.y0 = b.y0;
      w.y1 = b.y1;
      // First placement (or a pen that moved out from under it): scatter it
      // somewhere inside the (new) bounds and let it idle briefly first.
      if (!w.init || w.x < b.x0 || w.x > b.x1 || w.y < b.y0 || w.y > b.y1) {
        w.x = rand(b.x0, b.x1);
        w.y = rand(b.y0, b.y1);
        w.tx = w.x;
        w.ty = w.y;
        w.phase = 1;
        w.timer = rand(0, 1600);
        w.init = true;
        applyWalker(w);
      }
    }
  }
  for (const [key, w] of walkers) {
    if (!want.has(key)) {
      w.el.remove();
      walkers.delete(key);
    }
  }
}

// Advance every roaming animal's random walk by `dt` ms. Each picks a fresh
// target inside its pen, ambles there, rests a random beat, then repeats —
// turning to face the way it walks. Called every frame from the tick loop.
export function stepLivestock(dt: number): void {
  if (!livestockShown || reduceMotion || walkers.size === 0) return;
  for (const w of walkers.values()) {
    if (w.phase === 1) {
      w.timer -= dt;
      if (w.timer <= 0) {
        w.tx = rand(w.x0, w.x1);
        w.ty = rand(w.y0, w.y1);
        w.phase = 0;
        if (Math.abs(w.tx - w.x) > 1) w.dir = w.tx < w.x ? -1 : 1;
        w.face.style.transform = `scaleX(${w.dir})`;
        w.el.classList.add("mv");
      }
      continue;
    }
    const dx = w.tx - w.x;
    const dy = w.ty - w.y;
    const d = Math.hypot(dx, dy);
    const stepLen = w.speed * dt;
    if (d <= stepLen || d < 0.4) {
      w.x = w.tx;
      w.y = w.ty;
      w.phase = 1;
      w.timer = rand(500, 2800);
      w.el.classList.remove("mv");
    } else {
      w.x += (dx / d) * stepLen;
      w.y += (dy / d) * stepLen;
    }
    applyWalker(w);
  }
}

/* ======================================================================
 *  RENDER — the world is always the base; a building panel may slide up.
 * ==================================================================== */
export function render(): void {
  ensureScale();
  const tbScroll = dom.toolbar.scrollLeft;
  let cells = "";
  for (let i = 0; i < GRID_N; i++) {
    const t = state.grid[i];
    // Link cells are part of a larger building's footprint — its root renders
    // them, so skip them in both modes.
    if (t && t.kind === "link") continue;
    if (state.build) {
      cells += buildCell(i);
      continue;
    }
    if (!t) continue;
    if (t.kind === "soil") cells += soilCell(i, t);
    else cells += buildingCell(i, t);
  }
  dom.world.innerHTML =
    `<svg viewBox="0 0 ${WORLD_W} ${WORLD_H}" preserveAspectRatio="none" aria-hidden="true">${buildScene()}</svg>` +
    cells +
    placeGhost();
  dom.world.classList.toggle("building", state.build);
  // The roaming livestock live in their own layer so they keep walking across
  // the once-a-second world rebuild. Setting innerHTML above detached it (its
  // sprites survive, holding their walk state); re-append and reconcile it in
  // normal play, and leave it off while build mode shows the placement grid.
  if (state.build) {
    livestockShown = false;
  } else {
    const layer = ensureLivestockLayer();
    dom.world.appendChild(layer);
    livestockShown = true;
    syncLivestock();
  }
  applyWorld();
  dom.toolbar.innerHTML = renderToolbar();
  dom.toolbar.scrollLeft = tbScroll;
  renderOverlay();
  syncStats();
}

function cookStatus(): string {
  let cooking = 0;
  state.cooks.forEach((c) => {
    if (c && Date.now() < c.endsAt) cooking++;
  });
  return `🍳 ${state.stoves}${cooking ? ` · ⏲️ ${cooking}` : ""}`;
}
function greenhouseStatus(): string {
  let growing = 0;
  state.pots.forEach((p) => {
    if (p && Date.now() < p.endsAt) growing++;
  });
  return `🌷 ${state.potCap}${growing ? ` · ⏲️ ${growing}` : ""}`;
}
function apiaryStatus(): string {
  if (!isUnlocked(APIARY_LVL)) return `🔒 ${tf("lvl", { n: APIARY_LVL })}`;
  return `🍯 ${state.hives.length}/${MAX_HIVES}`;
}
export function readyCounts(): {
  cook: number;
  pot: number;
  pen: number;
  hive: number;
  fillable: number;
} {
  let cook = 0;
  state.cooks.forEach((c) => {
    if (c && Date.now() >= c.endsAt) cook++;
  });
  let pot = 0;
  state.pots.forEach((p) => {
    if (p && Date.now() >= p.endsAt) pot++;
  });
  let pen = 0;
  state.animals.forEach((a) => {
    if (a.grown >= ANIMAL_BY_ID[a.type].interval) pen++;
  });
  let hive = 0;
  state.hives.forEach((hv) => {
    if (hv.grown >= HIVE_MS) hive++;
  });
  let fillable = 0;
  state.quests.forEach((q) => {
    if (q && (state.inv[q.item] || 0) >= q.need) fillable++;
  });
  return { cook, pot, pen, hive, fillable };
}

// Mount / refresh the sliding building panel (same behaviour as before).
function renderOverlay(): void {
  const tab = state.tab;
  if (!PANELS[tab]) {
    if (overlayTab !== null) {
      dom.overlay.className = "overlay";
      dom.overlay.setAttribute("aria-hidden", "true");
      overlayTab = null;
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (!PANELS[state.tab]) dom.overlay.innerHTML = "";
      }, 260);
    }
    return;
  }
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  const body =
    tab === "market"
      ? renderMarket()
      : tab === "storage"
        ? renderStorage()
        : tab === "research"
          ? renderResearch()
          : tab === "pen"
            ? renderPen(state.penType as string)
            : tab === "cook"
              ? renderCook()
              : tab === "greenhouse"
                ? renderGreenhouse()
                : tab === "apiary"
                  ? renderApiary()
                  : renderQuests();
  // The pen panel's icon / title depend on which animal you tapped, so a
  // change of pen type counts as a fresh panel even when the tab is "pen".
  const fresh = overlayTab !== tab || (tab === "pen" && overlayPenType !== state.penType);
  if (fresh) {
    const p = PANELS[tab];
    const ico = tab === "pen" ? ANIMAL_BY_ID[state.penType as string].ico : p.ico;
    const ttl = tab === "pen" ? name(state.penType as string) : MG.i18n.t(p.title);
    dom.overlay.innerHTML =
      '<div class="sheet">' +
      '<div class="sheet-head">' +
      `<span class="sh-ico">${ico}</span>` +
      `<span class="sh-ttl">${esc(ttl)}</span>` +
      '<button class="sh-close" data-act="close" aria-label="close">✕</button>' +
      "</div>" +
      `<div class="sheet-body"><div class="wrap" id="sheetwrap">${body}</div></div>` +
      "</div>";
    dom.overlay.removeAttribute("aria-hidden");
    void dom.overlay.offsetWidth;
    dom.overlay.className = "overlay show";
    overlayTab = tab;
    overlayPenType = state.penType;
  } else {
    const w = $("sheetwrap");
    if (w) w.innerHTML = body;
  }
}

function tipLine(key: string): string {
  return `<div class="tip">${esc(MG.i18n.t(key))}</div>`;
}

// A full-width "Collect all" button shown above a building's slots when
// anything is ready to gather; `kind` routes the action (cook/pot/hive/pen).
function collectAllBar(kind: string, count: number): string {
  if (!count) return "";
  return (
    `<div class="collect-all"><button class="btn go" data-act="collectall" data-arg="${kind}">` +
    `${esc(MG.i18n.t("collectAll"))} (${count})</button></div>`
  );
}
// A slim summary card standing in for N empty slots, so panels don't grow
// a long tail of blank stoves / pots to scroll past.
function freeSlotsCard(ico: string, n: number): string {
  if (!n) return "";
  return (
    `<div class="card slim"><span class="big">${ico}</span>` +
    `<div class="body"><div class="sub">${esc(tf("freeSlots", { n }))}</div></div></div>`
  );
}

/* -------------------------------- PEN -------------------------------- */
// Per-animal management: buy more (up to MAX_PER_ANIMAL), run the pen with
// a feeder (auto-feeds from a loaded food stock) and a collector
// (auto-gathers produce), or collect ripe produce by hand in one tap.
function renderPen(type: string): string {
  const def = ANIMAL_BY_ID[type];
  if (!def) return tipLine("tipPen");
  const pen = ensurePen(type);
  const mine: (typeof state.animals)[number][] = [];
  state.animals.forEach((a) => {
    if (a.type === type) mine.push(a);
  });
  const count = mine.length;
  let ready = 0;
  let fedN = 0;
  let hungry = 0;
  let prog = 0;
  mine.forEach((a) => {
    if (a.grown >= def.interval) ready++;
    if (Date.now() < a.feedUntil) fedN++;
    else hungry++;
    prog += Math.min(1, a.grown / def.interval);
  });
  const feedHave = state.inv[def.feed] || 0;

  let h = tipLine("tipPen");

  // ---- Summary + collect-all -------------------------------------------
  if (!count) {
    h += `<div class="empty-note">${def.ico}<br>${esc(MG.i18n.t("penEmpty"))}</div>`;
  } else {
    const statusBadge = ready
      ? `<span class="badge ready">${ITEM[def.prod].ico} ×${ready}</span>`
      : `<span class="badge ${fedN === count ? "" : "lock"}">${fedN}/${count} ${esc(MG.i18n.t("fed"))}</span>`;
    const pct = ((prog / count) * 100).toFixed(1);
    h +=
      `<div class="card"><span class="big">${def.ico}</span><div class="body">` +
      `<div class="ttl">${esc(name(type))} <span class="badge lock">${esc(tf("owned", { n: count, max: MAX_PER_ANIMAL }))}</span> ${statusBadge}</div>` +
      `<div class="sub">${ITEM[def.prod].ico} ${esc(name(def.prod))} ${stk(def.prod)}</div>` +
      `<div class="pbar"><i style="width:${pct}%"></i></div></div>` +
      `<div class="right"><button class="btn alt sm" data-act="feedall" data-arg="pen"${hungry && feedHave > 0 ? "" : " disabled"}>` +
      `${esc(MG.i18n.t("feed"))} ${ITEM[def.feed].ico}</button>` +
      `<button class="btn go sm" data-act="collectall" data-arg="pen"${ready ? "" : " disabled"}>` +
      `${esc(MG.i18n.t("collectAll"))}</button></div></div>`;
  }

  // ---- Buy more --------------------------------------------------------
  if (count < MAX_PER_ANIMAL) {
    h +=
      `<div class="card"><span class="big">🛒</span><div class="body">` +
      `<div class="ttl">${esc(MG.i18n.t("buyAnimal"))} ${def.ico} ${esc(name(type))}</div>` +
      `<div class="sub">${ITEM[def.prod].ico} ${esc(name(def.prod))} · 🍽️ ${ITEM[def.feed].ico} ${esc(name(def.feed))}</div></div>` +
      `<div class="right"><button class="btn sm" data-act="buyanimal" data-arg="${type}"${state.coins >= def.cost ? "" : " disabled"}>🪙 ${def.cost}</button></div></div>`;
  } else {
    h +=
      `<div class="card"><span class="big">🛒</span><div class="body">` +
      `<div class="ttl">${esc(name(type))}</div></div>` +
      `<div class="right"><span class="badge lock">${esc(tf("penFull", { n: MAX_PER_ANIMAL }))}</span></div></div>`;
  }

  // ---- Feeder (load food → animals auto-feed) --------------------------
  if (!pen.feeder) {
    const fc = feederCost(type);
    h +=
      `<div class="card"><span class="big">🍽️</span><div class="body">` +
      `<div class="ttl">${esc(MG.i18n.t("feeder"))}</div>` +
      `<div class="sub">${esc(tf("feederSub", { item: ITEM[def.feed].ico, name: name(def.feed) }))}</div></div>` +
      `<div class="right"><button class="btn sm" data-act="buyfeeder" data-arg="${type}"${state.coins >= fc ? "" : " disabled"}>🪙 ${fc}</button></div></div>`;
  } else {
    const fpct = ((pen.feed / FEEDER_CAP) * 100).toFixed(1);
    h +=
      `<div class="card"><span class="big">🍽️</span><div class="body">` +
      `<div class="ttl">${esc(MG.i18n.t("feeder"))} <span class="badge ready">${esc(MG.i18n.t("autoFeed"))}</span></div>` +
      `<div class="sub">${ITEM[def.feed].ico} ${pen.feed}/${FEEDER_CAP} · 📦 ${feedHave}</div>` +
      `<div class="pbar"><i style="width:${fpct}%"></i></div></div>` +
      `<div class="right"><button class="btn alt sm" data-act="loadfeed" data-arg="${type}"${feedHave > 0 && pen.feed < FEEDER_CAP ? "" : " disabled"}>` +
      `${esc(MG.i18n.t("loadFeed"))} ${ITEM[def.feed].ico}</button></div></div>`;
  }

  // ---- Collector (auto-gathers produce) --------------------------------
  if (!pen.collector) {
    const cc = collectorCost(type);
    h +=
      `<div class="card"><span class="big">🧺</span><div class="body">` +
      `<div class="ttl">${esc(MG.i18n.t("collector"))}</div>` +
      `<div class="sub">${esc(MG.i18n.t("collectorSub"))}</div></div>` +
      `<div class="right"><button class="btn sm" data-act="buycollector" data-arg="${type}"${state.coins >= cc ? "" : " disabled"}>🪙 ${cc}</button></div></div>`;
  } else {
    h +=
      `<div class="card"><span class="big">🧺</span><div class="body">` +
      `<div class="ttl">${esc(MG.i18n.t("collector"))} <span class="badge ready">${esc(MG.i18n.t("autoCollect"))}</span></div>` +
      `<div class="sub">${esc(MG.i18n.t("collectorSub"))}</div></div></div>`;
  }
  return h;
}

/* ------------------------------- KITCHEN ----------------------------- */
function renderCook(): string {
  let h = tipLine("tipCook");

  // The cooking queue sits up top as a compact carousel — each busy stove is
  // just the dish's image inside a progress ring (tap a ready one to collect),
  // free stoves are faint placeholders. Keeping it small means starting a dish
  // never pushes the recipe you just tapped out of view.
  h += `<div class="section-h">${esc(MG.i18n.t("stoves"))} (${state.stoves})</div>`;
  h += collectAllBar("cook", readyCounts().cook);
  h += `<div class="cook-queue">`;
  state.cooks.forEach((c, i) => {
    if (!c) {
      h += `<div class="cook-slot empty"><span class="cook-ring"><span class="cs-img">🍳</span></span></div>`;
      return;
    }
    const def = DISH_BY_ID[c.dish];
    const total = c.total || def.cook;
    const left = Math.max(0, c.endsAt - Date.now());
    const ready = left <= 0;
    const pct = Math.min(100, ((total - left) / total) * 100).toFixed(1);
    h +=
      `<button class="cook-slot${ready ? " ready" : ""}" data-act="collectcook" data-arg="${i}"${ready ? "" : " disabled"}>` +
      `<span class="cook-ring${ready ? " ready" : ""}" data-cbar="${i}" style="--p:${pct}">` +
      `<span class="cs-img">${def.ico}</span></span>` +
      `<span class="cs-tag">${ready ? "✓" : fmtTime(left)}</span></button>`;
  });
  h += `</div>`;

  h += `<div class="section-h">${esc(MG.i18n.t("recipes"))}</div>`;
  const freeStove = state.cooks.some((c) => !c);
  DISHES.forEach((d) => {
    const lock = !isUnlocked(d.lvl);
    const can = hasRecipe(d.recipe);
    let ings = "";
    for (const k in d.recipe) {
      const miss = (state.inv[k] || 0) < d.recipe[k];
      ings += `<span class="ing${miss ? " miss" : ""}">${ITEM[k].ico} ${state.inv[k] || 0}/${d.recipe[k]}</span>`;
    }
    h +=
      `<div class="card${lock ? " locked" : ""}"><span class="big">${d.ico}</span><div class="body">` +
      `<div class="ttl">${esc(name(d.id))} ${stk(d.id)} <span class="badge lock">+${d.xp} XP</span></div>` +
      (lock
        ? `<div class="sub">🔒 ${esc(tf("needLevel", { n: d.lvl }))}</div>`
        : `<div class="ingredients">${ings}</div>`) +
      "</div><div class='right'>" +
      (lock
        ? ""
        : `<button class="btn sm" data-act="cook" data-arg="${d.id}"${can && freeStove ? "" : " disabled"}>${esc(MG.i18n.t("cook"))}</button>`) +
      "</div></div>";
  });

  return h;
}
function fmtTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${`0${s % 60}`.slice(-2)}`;
}

/* ----------------------------- GREENHOUSE ---------------------------- */
// Flower pots mirror the kitchen's stoves: plant a flower into a free pot,
// it grows on a timer, then you collect the bloom into storage.
function renderGreenhouse(): string {
  let h = tipLine("tipGreenhouse");

  h += `<div class="section-h">${esc(MG.i18n.t("pots"))} (${state.potCap})</div>`;
  h += collectAllBar("pot", readyCounts().pot);
  let freePots = 0;
  state.pots.forEach((p, i) => {
    if (!p) {
      freePots++;
      return;
    }
    const def = FLOWER_BY_ID[p.flower];
    const total = p.total || def.grow;
    const left = Math.max(0, p.endsAt - Date.now());
    const ready = left <= 0;
    const pct = Math.min(100, ((total - left) / total) * 100).toFixed(1);
    h +=
      `<div class="card" data-pot="${i}"><span class="big">${def.ico}</span><div class="body">` +
      `<div class="ttl">${esc(name(p.flower))} ${stk(p.flower)}` +
      (ready
        ? ' <span class="badge ready">✓</span>'
        : ` <span class="badge">${fmtTime(left)}</span>`) +
      "</div>" +
      `<div class="pbar${ready ? "" : " warm"}" data-potbar="${i}"><i style="width:${pct}%"></i></div></div>` +
      `<div class="right"><button class="btn go sm" data-act="collectpot" data-arg="${i}"${ready ? "" : " disabled"}>` +
      `${esc(MG.i18n.t("collect"))}</button></div></div>`;
  });
  h += freeSlotsCard("🪴", freePots);
  if (state.potCap < MAX_POTS) {
    h += upgradeCard(
      "pot",
      "🪴",
      MG.i18n.t("buyPot"),
      `${state.potCap} → ${state.potCap + 1}`,
      potCost(),
    );
  }

  h += `<div class="section-h">${esc(MG.i18n.t("flowers"))}</div>`;
  const freePot = state.pots.some((p) => !p);
  FLOWERS.forEach((f) => {
    const lock = !isUnlocked(f.lvl);
    const canPay = state.coins >= f.seed;
    h +=
      `<div class="card${lock ? " locked" : ""}"><span class="big">${f.ico}</span><div class="body">` +
      `<div class="ttl">${esc(name(f.id))} ${stk(f.id)} <span class="badge lock">+${f.xp} XP</span></div>` +
      (lock
        ? `<div class="sub">🔒 ${esc(tf("needLevel", { n: f.lvl }))}</div>`
        : `<div class="sub">🪙 ${f.seed} · ⏲️ ${fmtTime(f.grow)} · ${priceHtml(f.id)}</div>`) +
      "</div><div class='right'>" +
      (lock
        ? ""
        : `<button class="btn sm" data-act="plant" data-arg="${f.id}"${canPay && freePot ? "" : " disabled"}>${esc(MG.i18n.t("plant"))}</button>`) +
      "</div></div>";
  });
  return h;
}

/* ------------------------------- APIARY ------------------------------ */
// Beehives mirror animals but need no feeding: each fills with honey on a
// timer, then you collect a jar. Buy more hives up to MAX_HIVES.
function renderApiary(): string {
  let h = tipLine("tipApiary");
  h += `<div class="section-h">${esc(MG.i18n.t("hives"))} (${state.hives.length}/${MAX_HIVES})</div>`;
  if (!state.hives.length) {
    h += `<div class="empty-note">🐝🍯<br>${esc(MG.i18n.t("apiaryEmpty"))}</div>`;
  }
  h += collectAllBar("hive", readyCounts().hive);
  const honey = ITEM.honey;
  state.hives.forEach((hv, i) => {
    const ready = hv.grown >= HIVE_MS;
    const left = Math.max(0, HIVE_MS - hv.grown);
    const pct = Math.min(100, (hv.grown / HIVE_MS) * 100).toFixed(1);
    h +=
      `<div class="card" data-hive="${i}"><span class="big">🐝</span><div class="body">` +
      `<div class="ttl">${honey.ico} ${esc(name("honey"))} ${stk("honey")}` +
      (ready
        ? ` <span class="badge ready">${honey.ico}</span>`
        : ` <span class="badge">${fmtTime(left)}</span>`) +
      "</div>" +
      `<div class="pbar${ready ? "" : " warm"}" data-hivebar="${i}"><i style="width:${pct}%"></i></div></div>` +
      `<div class="right"><button class="btn go sm" data-act="collecthive" data-arg="${i}"${ready ? "" : " disabled"}>` +
      `${esc(MG.i18n.t("collect"))}</button></div></div>`;
  });
  if (state.hives.length < MAX_HIVES) {
    h += upgradeCard(
      "hive",
      "🐝",
      MG.i18n.t("buyHive"),
      `${state.hives.length} → ${state.hives.length + 1}`,
      hiveCost(),
    );
  }
  return h;
}

/* ------------------------------- MARKET ------------------------------ */
function priceHtml(id: string): string {
  const m = state.prices[id] || 1;
  const arrow =
    m > 1.08 ? '<span class="up">▲</span>' : m < 0.92 ? '<span class="down">▼</span>' : "";
  return `<span class="price">🪙 ${price(id)} ${arrow}</span>`;
}
function renderMarket(): string {
  let h = tipLine("tipMarket");

  h += `<div class="section-h">${esc(MG.i18n.t("mSell"))}</div>`;
  const ids: string[] = [];
  for (const id in ITEM) if (state.inv[id]) ids.push(id);
  ids.sort((a, b) => price(b) - price(a));
  if (!ids.length) {
    h += `<div class="empty-note">${esc(MG.i18n.t("emptyStore"))}</div>`;
  } else {
    ids.forEach((id) => {
      h +=
        `<div class="card"><span class="big">${ITEM[id].ico}</span><div class="body">` +
        `<div class="ttl">${esc(name(id))} ${stk(id)}</div>` +
        `<div class="sub">${priceHtml(id)}</div></div>` +
        `<div class="right" style="flex-direction:row">` +
        `<button class="btn alt sm" data-act="sell" data-arg="${id}">${esc(MG.i18n.t("sell"))}</button>` +
        `<button class="btn sm" data-act="sellall" data-arg="${id}">${esc(MG.i18n.t("sellAll"))}</button>` +
        "</div></div>";
    });
  }
  return h;
}

/* ------------------------------- STORAGE ----------------------------- */
// The barn: how full storage is, the capacity upgrade, and a read-only grid of
// everything currently held (selling still lives at the Market).
function renderStorage(): string {
  let h = tipLine("tipStorage");
  const n = invCount();
  const pct = Math.min(100, (n / state.cap) * 100).toFixed(1);
  h +=
    `<div class="card"><span class="big">📦</span><div class="body">` +
    `<div class="ttl">${esc(MG.i18n.t("storageUse"))} <span class="badge ${n >= state.cap ? "" : "lock"}">${n}/${state.cap}</span></div>` +
    `<div class="pbar"><i style="width:${pct}%"></i></div></div></div>`;
  h += upgradeCard("cap", "📦", MG.i18n.t("upCap"), `${state.cap} → ${state.cap + 20}`, capCost());

  h += `<div class="section-h">${esc(MG.i18n.t("stored"))}</div>`;
  const ids: string[] = [];
  for (const id in ITEM) if (state.inv[id]) ids.push(id);
  ids.sort((a, b) => price(b) - price(a));
  if (!ids.length) {
    h += `<div class="empty-note">${esc(MG.i18n.t("emptyStore"))}</div>`;
  } else {
    h += `<div class="store-grid">`;
    ids.forEach((id) => {
      h +=
        `<div class="store-item"><span class="si-ico">${ITEM[id].ico}</span>` +
        `<span class="si-n">${state.inv[id]}</span></div>`;
    });
    h += `</div>`;
  }
  return h;
}

/* ------------------------------ RESEARCH ----------------------------- */
// The lab: the farm-wide upgrades that used to sit in the market (an extra
// stove, richer soil, the sprinkler, a faster oven, greenhouse heat and the
// trader's licence).
const RESEARCH_TOTAL = 6;
// How many research upgrades the player can buy right now (affordable & not
// maxed) — drives the building's badge so a ready upgrade is noticeable.
function researchAvail(): number {
  let n = 0;
  if (state.coins >= stoveCost()) n++;
  if (state.soil < MAX_SOIL && state.coins >= soilCost()) n++;
  if (state.sprinkler < MAX_SPRINKLER && state.coins >= sprinklerCost()) n++;
  if (state.oven < MAX_OVEN && state.coins >= ovenCost()) n++;
  if (state.heater < MAX_HEATER && state.coins >= heaterCost()) n++;
  if (state.trade < MAX_TRADE && state.coins >= tradeCost()) n++;
  return n;
}
function renderResearch(): string {
  let h = tipLine("tipResearch");
  h += upgradeCard(
    "stove",
    "🍳",
    MG.i18n.t("upStove"),
    `${state.stoves} → ${state.stoves + 1}`,
    stoveCost(),
  );
  const soilSub = tf("upSoilSub", { n: Math.round((state.soil + 1) * SOIL_STEP * 100) });
  h += upgradeCard("soil", "🌱", MG.i18n.t("upSoil"), soilSub, soilCost(), state.soil >= MAX_SOIL);
  const sprSub = MG.i18n.t("upSprinklerSub") + (state.sprinkler ? ` · ⚡${state.sprinkler}` : "");
  h += upgradeCard(
    "sprinkler",
    "💧",
    MG.i18n.t("upSprinkler"),
    sprSub,
    sprinklerCost(),
    state.sprinkler >= MAX_SPRINKLER,
  );
  const ovenSub = tf("upOvenSub", { n: Math.round((state.oven + 1) * OVEN_STEP * 100) });
  h += upgradeCard("oven", "🔥", MG.i18n.t("upOven"), ovenSub, ovenCost(), state.oven >= MAX_OVEN);
  const heaterSub = tf("upHeaterSub", { n: Math.round((state.heater + 1) * HEATER_STEP * 100) });
  h += upgradeCard(
    "heater",
    "🌡️",
    MG.i18n.t("upHeater"),
    heaterSub,
    heaterCost(),
    state.heater >= MAX_HEATER,
  );
  const tradeSub = tf("upTradeSub", { n: Math.round((state.trade + 1) * TRADE_STEP * 100) });
  h += upgradeCard(
    "trade",
    "🤝",
    MG.i18n.t("upTrade"),
    tradeSub,
    tradeCost(),
    state.trade >= MAX_TRADE,
  );
  return h;
}
function upgradeCard(
  id: string,
  ico: string,
  ttl: string,
  sub: string,
  cost: number,
  maxed?: boolean,
): string {
  const right = maxed
    ? `<span class="badge lock">${esc(MG.i18n.t("maxed"))}</span>`
    : `<button class="btn sm" data-act="upgrade" data-arg="${id}"${state.coins < cost ? " disabled" : ""}>🪙 ${cost}</button>`;
  return (
    `<div class="card"><span class="big">${ico}</span><div class="body">` +
    `<div class="ttl">${esc(ttl)}</div><div class="sub">${esc(sub)}</div></div>` +
    `<div class="right">${right}</div></div>`
  );
}

/* ------------------------------- QUESTS ------------------------------ */
function renderQuests(): string {
  let h = tipLine("tipQuests");
  state.quests.forEach((q, i) => {
    if (!q) {
      h += `<div class="card"><div class="body"><div class="sub">${esc(MG.i18n.t("newOrder"))}</div></div></div>`;
      return;
    }
    const have = state.inv[q.item] || 0;
    const can = have >= q.need;
    h +=
      `<div class="card"><span class="big">${ITEM[q.item].ico}</span><div class="body">` +
      `<div class="ttl">${esc(MG.i18n.t("wants"))} ${q.need}× ${esc(name(q.item))}` +
      ` <span class="badge ${can ? "ready" : "lock"}">${have}/${q.need}</span></div>` +
      `<div class="sub">${stk(q.item)} · 🎁 🪙 ${q.coins} · +${q.xp} XP</div></div>` +
      `<div class="right"><button class="btn go sm" data-act="quest" data-arg="${i}"${can ? "" : " disabled"}>${esc(MG.i18n.t("deliver"))}</button></div></div>`;
  });
  return h;
}

/* ======================================================================
 *  LIVE PATCH — cheap per-frame update of volatile bits.
 * ==================================================================== */
export function patch(): void {
  const cells = dom.world.querySelectorAll("[data-plotcell]");
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    const i = +(cell.getAttribute("data-plotcell") as string);
    const t = state.grid[i];
    if (t?.kind !== "soil") continue;
    const spr = cell.querySelector(".sprite");
    const bar = cell.querySelector(".bar > i") as HTMLElement | null;
    if (!t.crop) {
      if (cell.getAttribute("data-stage") !== "-1") {
        if (spr) spr.innerHTML = "";
        cell.setAttribute("data-stage", "-1");
      }
      cell.className = "plot empty";
      if (bar) bar.style.width = "0%";
      continue;
    }
    const c = CROP_BY_ID[t.crop];
    const rdy = (t.grown || 0) >= c.grow;
    const cls = `plot${rdy ? " ready" : (t.water || 0) > 0 ? " watered" : ""}${t.fert ? " fert" : ""}`;
    if (cell.className !== cls) cell.className = cls;
    // The drawn plant only changes when the crop crosses a growth stage, so
    // reparse its SVG sparingly (per-frame work stays the cheap bar update).
    const stage = plotStage(t);
    if (cell.getAttribute("data-stage") !== String(stage)) {
      if (spr) spr.innerHTML = cropArt(t.crop, stage as 0 | 1 | 2 | 3);
      cell.setAttribute("data-stage", String(stage));
    }
    if (bar) bar.style.width = `${Math.min(100, ((t.grown || 0) / c.grow) * 100).toFixed(1)}%`;
  }
  if (state.tab === "cook") {
    state.cooks.forEach((c, i) => {
      if (!c) return;
      const def = DISH_BY_ID[c.dish];
      const total = c.total || def.cook;
      const left = Math.max(0, c.endsAt - Date.now());
      const ring = dom.overlay.querySelector(`[data-cbar="${i}"]`) as HTMLElement | null;
      if (ring)
        ring.style.setProperty("--p", Math.min(100, ((total - left) / total) * 100).toFixed(1));
    });
  } else if (state.tab === "greenhouse") {
    state.pots.forEach((p, i) => {
      if (!p) return;
      const def = FLOWER_BY_ID[p.flower];
      const total = p.total || def.grow;
      const left = Math.max(0, p.endsAt - Date.now());
      const bar = dom.overlay.querySelector(`[data-potbar="${i}"] > i`) as HTMLElement | null;
      if (bar) bar.style.width = `${Math.min(100, ((total - left) / total) * 100).toFixed(1)}%`;
    });
  } else if (state.tab === "apiary") {
    state.hives.forEach((hv, i) => {
      const bar = dom.overlay.querySelector(`[data-hivebar="${i}"] > i`) as HTMLElement | null;
      if (bar) bar.style.width = `${Math.min(100, (hv.grown / HIVE_MS) * 100).toFixed(1)}%`;
    });
  }
}

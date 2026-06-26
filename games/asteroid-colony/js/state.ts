/* ============================================================================
 *  Asteroid Colony — game state & persistence.
 *
 *  Owns the single canonical `state` object and the versioned save store. The
 *  state object is created once and mutated in place (never reassigned) so every
 *  module imports a stable reference. `load()` rebuilds it from a save (with
 *  defensive validation + offline catch-up); `reset()` returns a fresh asteroid.
 * ========================================================================== */
import { MG } from "../../../shared/mg";
import {
  ALL_MATERIALS,
  BUILD_BY_ID,
  COLS,
  DUPE_GLYPHS,
  idx,
  mulberry32,
  N,
  O2_TARGET,
  ROWS,
  SPACE_ROWS,
  SPACE_TEMP,
  START_TEMP,
  TILE_BY_ID,
} from "./config";
import { advance } from "./sim";
import type { BuildingId, Duplicant, Material, State, Tile, TileSolid } from "./types";

const store = MG.storage<Record<string, any>>("asteroid-colony", { version: 1 });

// The canonical state — created once, mutated in place.
export const state = {} as State;

function assignInto(target: Record<string, any>, src: Record<string, any>): void {
  for (const k of Object.keys(target)) delete target[k];
  for (const k of Object.keys(src)) target[k] = src[k];
}

let dirty = false;
export function markDirty(): void {
  dirty = true;
}
export function isDirty(): boolean {
  return dirty;
}
export function clearDirty(): void {
  dirty = false;
}

function emptyStock(): Record<Material, number> {
  const s = {} as Record<Material, number>;
  for (const m of ALL_MATERIALS) s[m] = 0;
  return s;
}

/** A solid tile with zeroed fields. */
function solidTile(solid: TileSolid): Tile {
  return { solid, o2: 0, co2: 0, water: 0, temp: START_TEMP };
}
/** An open (dug) tile. */
function openTile(o2: number, temp: number): Tile {
  return { solid: null, o2, co2: 0, water: 0, temp };
}

function makeDupe(cx: number, cy: number, i: number): Duplicant {
  return {
    cx,
    cy,
    tx: cx,
    ty: cy,
    job: null,
    belly: 1200,
    stamina: 1,
    o2Debt: 0,
    foodDebt: 0,
    heatDebt: 0,
    alive: true,
    glyph: DUPE_GLYPHS[i % DUPE_GLYPHS.length],
  };
}

// Pick a solid kind for cell (col,row) based on depth + a little noise.
function rockAt(r: number, rng: () => number): TileSolid {
  const depth = (r - SPACE_ROWS) / (ROWS - SPACE_ROWS); // 0 top .. 1 bottom
  const n = rng();
  if (r >= ROWS - 2) return n < 0.7 ? "obsidian" : "rock";
  if (depth < 0.18) return n < 0.85 ? "dirt" : "rock";
  if (depth < 0.45) {
    if (n < 0.22) return "algaeRock";
    if (n < 0.35) return "rock";
    return "dirt";
  }
  if (depth < 0.72) {
    if (n < 0.2) return "oreRock";
    if (n < 0.36) return "coalRock";
    if (n < 0.48) return "rock";
    return "dirt";
  }
  if (n < 0.18) return "iceRock";
  if (n < 0.32) return "oreRock";
  if (n < 0.46) return "coalRock";
  return "rock";
}

function freshGrid(rng: () => number): Tile[] {
  const grid: Tile[] = new Array(N);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r < SPACE_ROWS) {
        grid[idx(c, r)] = openTile(0, SPACE_TEMP); // vacuum / heat sink
      } else {
        grid[idx(c, r)] = solidTile(rockAt(r, rng));
      }
    }
  }
  // Carve a breathable starter pocket near the centre, leaving a solid floor below.
  const c0 = 14;
  const c1 = 22;
  const r0 = SPACE_ROWS;
  const r1 = SPACE_ROWS + 4;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      grid[idx(c, r)] = openTile(O2_TARGET, START_TEMP);
    }
  }
  return grid;
}

export function freshState(): State {
  const rng = mulberry32(0x9e3779b1);
  const grid = freshGrid(rng);
  const stock = emptyStock();
  // A small supply cache so the player can build the first machines.
  stock.dirt = 24;
  stock.ore = 16;
  stock.rock = 12;
  stock.algae = 6;
  // One duplicant standing on the pocket floor.
  const startCol = 18;
  const startRow = SPACE_ROWS + 4;
  const s: State = {
    cols: COLS,
    rows: ROWS,
    grid,
    dupes: [makeDupe(startCol + 0.5, startRow + 0.5, 0)],
    food: 1500,
    foodCap: 1500, // a starter ration cache
    stock,
    power: 0,
    battery: 0,
    batteryCap: 0,
    cycle: 1,
    cycleMs: 0,
    morale: 60,
    tool: "dig",
    buildSel: "diffuser",
    view: "normal",
    selCell: null,
    deaths: 0,
    best: 0,
    lastSeen: Date.now(),
  };
  return s;
}

// --- serialization ---------------------------------------------------------

function packTile(t: Tile): any {
  const o: any = { s: t.solid };
  if (t.marked) o.m = 1;
  if (t.digProgress) o.dp = Math.round(t.digProgress);
  if (t.build) o.b = t.build;
  if (t.blueprint) o.bp = t.blueprint;
  if (t.buildProgress) o.bpr = Math.round(t.buildProgress);
  if (t.grow) o.g = Math.round(t.grow);
  if (t.o2) o.o = Math.round(t.o2);
  if (t.co2) o.c = Math.round(t.co2);
  if (t.water) o.w = Math.round(t.water);
  o.t = Math.round(t.temp);
  return o;
}

function unpackTile(raw: any): Tile {
  if (!raw || typeof raw !== "object") return solidTile("rock");
  const solid: TileSolid | null = raw.s && TILE_BY_ID[raw.s] ? raw.s : null;
  const t: Tile = {
    solid,
    o2: Math.max(0, +raw.o || 0),
    co2: Math.max(0, +raw.c || 0),
    water: Math.max(0, +raw.w || 0),
    temp: typeof raw.t === "number" ? raw.t : START_TEMP,
  };
  if (raw.m) t.marked = true;
  if (raw.dp) t.digProgress = Math.max(0, +raw.dp);
  if (raw.b && BUILD_BY_ID[raw.b]) t.build = raw.b;
  if (raw.bp && BUILD_BY_ID[raw.bp]) t.blueprint = raw.bp;
  if (raw.bpr) t.buildProgress = Math.max(0, +raw.bpr);
  if (raw.g) t.grow = Math.max(0, +raw.g);
  return t;
}

export function save(): void {
  store.save({
    grid: state.grid.map(packTile),
    dupes: state.dupes.map((d) => ({
      cx: d.cx,
      cy: d.cy,
      belly: Math.round(d.belly),
      stamina: +d.stamina.toFixed(3),
      alive: d.alive,
      glyph: d.glyph,
    })),
    food: Math.round(state.food),
    foodCap: state.foodCap,
    stock: state.stock,
    battery: Math.round(state.battery),
    batteryCap: state.batteryCap,
    cycle: state.cycle,
    cycleMs: Math.round(state.cycleMs),
    morale: +state.morale.toFixed(1),
    buildSel: state.buildSel,
    view: state.view,
    deaths: state.deaths,
    best: state.best,
    lastSeen: Date.now(),
  });
  dirty = false;
}

export function load(): void {
  assignInto(state, freshState());
  const d = store.load();
  if (d && typeof d === "object") {
    if (Array.isArray(d.grid) && d.grid.length === N) {
      state.grid = d.grid.map(unpackTile);
    }
    if (Array.isArray(d.dupes)) {
      state.dupes = [];
      d.dupes.forEach((raw: any, i: number) => {
        if (!raw || typeof raw !== "object") return;
        const dp = makeDupe(+raw.cx || 18, +raw.cy || 6, i);
        dp.belly = Math.max(0, +raw.belly || 0);
        dp.stamina = Math.min(1, Math.max(0, +raw.stamina || 1));
        dp.alive = raw.alive !== false;
        if (typeof raw.glyph === "string") dp.glyph = raw.glyph;
        state.dupes.push(dp);
      });
      if (!state.dupes.length) state.dupes = freshState().dupes;
    }
    if (typeof d.food === "number") state.food = Math.max(0, d.food);
    if (typeof d.foodCap === "number") state.foodCap = Math.max(0, d.foodCap);
    if (d.stock && typeof d.stock === "object") {
      for (const m of ALL_MATERIALS) {
        if (typeof d.stock[m] === "number" && d.stock[m] >= 0)
          state.stock[m] = Math.floor(d.stock[m]);
      }
    }
    if (typeof d.battery === "number") state.battery = Math.max(0, d.battery);
    if (typeof d.batteryCap === "number") state.batteryCap = Math.max(0, d.batteryCap);
    if (typeof d.cycle === "number" && d.cycle >= 1) state.cycle = Math.floor(d.cycle);
    if (typeof d.cycleMs === "number" && d.cycleMs >= 0) state.cycleMs = d.cycleMs;
    if (typeof d.morale === "number") state.morale = Math.min(100, Math.max(0, d.morale));
    if (typeof d.buildSel === "string" && BUILD_BY_ID[d.buildSel])
      state.buildSel = d.buildSel as BuildingId;
    if (d.view === "oxygen" || d.view === "heat" || d.view === "normal") state.view = d.view;
    if (typeof d.deaths === "number" && d.deaths >= 0) state.deaths = Math.floor(d.deaths);
    if (typeof d.best === "number" && d.best >= 0) state.best = Math.floor(d.best);
  }

  // Offline catch-up: resolve everything through the same fixed sim step.
  const now = Date.now();
  const away = now - (+d?.lastSeen || now);
  if (away > 1000 && livingDupes() > 0) advance(away);
  state.lastSeen = now;
}

export function reset(): void {
  const keepBest = state.best || 0;
  assignInto(state, freshState());
  state.best = keepBest;
  save();
}

// --- small queries shared across modules -----------------------------------

export function livingDupes(): number {
  let n = 0;
  for (const d of state.dupes) if (d.alive) n++;
  return n;
}

/** Add a fresh duplicant at the starter pocket (colony growth / "printing"). */
export function spawnDupe(): void {
  const cx = 18.5;
  const cy = SPACE_ROWS + 2.5;
  const d = makeDupe(cx, cy, state.dupes.length);
  state.dupes.push(d);
}

export function cellIndexAt(cx: number, cy: number): number {
  const c = Math.max(0, Math.min(COLS - 1, Math.floor(cx)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor(cy)));
  return idx(c, r);
}

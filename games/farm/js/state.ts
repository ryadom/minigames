/* ============================================================================
 *  Farm — game state & persistence.
 *
 *  Owns the single canonical `state` object and the versioned save store.
 *  The state object is created once and always *mutated in place* (never
 *  reassigned), so every other module can import a stable reference to it.
 *  `load()` rebuilds it from a save (with offline-progress catch-up and
 *  defensive validation); `reset()` returns it to a fresh farm.
 *
 *  The world is a tile grid: soil plots, shops and pens are *placed* onto it
 *  in build mode, so the canonical state carries a `grid` of tiles rather than
 *  a fixed field. (The grid rework intentionally drops pre-grid saves.)
 * ========================================================================== */
import { MG } from "../../../shared/mg";
import {
  ANIMAL_BY_ID,
  ANIMALS,
  CROP_BY_ID,
  DISH_BY_ID,
  FEED_MS,
  FEEDER_CAP,
  FLOWER_BY_ID,
  footprintCells,
  GRID_COLS,
  GRID_N,
  HIVE_MS,
  ITEM,
  inBounds,
  MAX_HEATER,
  MAX_HIVES,
  MAX_OVEN,
  MAX_PER_ANIMAL,
  MAX_POTS,
  MAX_SOIL,
  MAX_SPRINKLER,
  MAX_TRADE,
  START_POTS,
} from "./config";
import { makeQuest, rollMarket, soilMul } from "./economy";
import type { Pen, State, Tile, TileKind } from "./types";

const VALID_KINDS: Record<string, boolean> = {
  soil: true,
  market: true,
  storage: true,
  research: true,
  board: true,
  kitchen: true,
  greenhouse: true,
  apiary: true,
  pen: true,
  link: true,
};

// Stamp a 2×2 building of `kind` into the first free spot of a *saved* grid
// (the migration runs on raw save data, before the canonical state exists), but
// only if one isn't already placed. Used to retrofit the storage / research
// buildings into older saves that pre-date them.
function injectBuild(grid: any[], kind: string): void {
  if (grid.some((t) => t && t.kind === kind)) return;
  for (let i = 0; i < GRID_N; i++) {
    if (!inBounds(i, 2, 2)) continue;
    const cells = footprintCells(i, 2, 2);
    if (cells.every((c) => !grid[c])) {
      grid[i] = { kind, w: 2, h: 2 };
      cells.forEach((c) => {
        if (c !== i) grid[c] = { kind: "link", root: i };
      });
      return;
    }
  }
}

const store = MG.storage<Record<string, any>>("farm", {
  version: 8,
  migrations: {
    // 6: the farm becomes a buildable tile grid (soil, shops and pens are all
    // placed on a grid). The old fixed-field layout is incompatible.
    6: () => null,
    // 7: the grid is rescaled (more, smaller cells) and buildings gained
    // multi-cell footprints (2×2 shops, a 3×3 greenhouse). Old single-cell
    // grids no longer line up, so any pre-footprint save is dropped.
    7: () => null,
    // 8: storage capacity & workshop upgrades moved out of the market into their
    // own Storage and Research buildings — retrofit them into existing farms.
    8: (d) => {
      if (d && Array.isArray(d.grid)) {
        injectBuild(d.grid, "storage");
        injectBuild(d.grid, "research");
      }
      return d;
    },
  },
});

// The canonical state object — created once, mutated in place.
export const state = {} as State;

// Copy all of `src`'s own properties into `target`, clearing the rest.
// Lets us refresh the canonical state without breaking held references.
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

export function need(level: number): number {
  return 60 + (level - 1) * 50;
} // XP to reach next level

// Per-pen state: an optional feeder (auto-feeds from a loaded food stock)
// and an optional collector (auto-gathers produce into storage).
function freshPens(): Record<string, Pen> {
  const o: Record<string, Pen> = {};
  ANIMALS.forEach((a) => {
    o[a.id] = { feeder: false, collector: false, feed: 0 };
  });
  return o;
}
export function ensurePen(type: string): Pen {
  if (!state.pens[type]) state.pens[type] = { feeder: false, collector: false, feed: 0 };
  return state.pens[type];
}
export function countAnimals(type: string): number {
  let n = 0;
  for (let i = 0; i < state.animals.length; i++) if (state.animals[i].type === type) n++;
  return n;
}

// A fresh soil tile ready to plant.
function freshSoil(): Tile {
  return { kind: "soil", crop: null, grown: 0, water: 0, fert: false };
}

/** The root (top-left) cell of whatever building covers cell `i`. */
export function rootOf(i: number): number {
  const t = state.grid[i];
  if (t && t.kind === "link" && typeof t.root === "number") return t.root;
  return i;
}

/** Can a `w` × `h` footprint be placed rooted at cell `i`? */
export function buildFits(grid: (Tile | null)[], i: number, w: number, h: number): boolean {
  if (!inBounds(i, w, h)) return false;
  return footprintCells(i, w, h).every((c) => !grid[c]);
}

/** Stamp a building (root + its `link` cells) onto `grid` rooted at cell `i`. */
export function stampBuild(grid: (Tile | null)[], i: number, tile: Tile): void {
  const w = tile.w || 1;
  const h = tile.h || 1;
  footprintCells(i, w, h).forEach((c) => {
    grid[c] = c === i ? tile : { kind: "link", root: i };
  });
}

/** Clear the whole footprint of the building covering cell `i`. */
export function clearBuild(i: number): void {
  const root = rootOf(i);
  const rt = state.grid[root];
  if (!rt) return;
  footprintCells(root, rt.w || 1, rt.h || 1).forEach((c) => {
    state.grid[c] = null;
  });
}

/** Move the building rooted at `src` so its top-left sits at `dest`, keeping
 *  all its tile data (crops, pen type, footprint). Returns false (leaving the
 *  grid untouched) when the building won't fit at the destination. The source
 *  footprint is freed first, so the new spot may overlap the old one. */
export function moveBuild(src: number, dest: number): boolean {
  const root = rootOf(src);
  const tile = state.grid[root];
  if (!tile || tile.kind === "link") return false;
  const w = tile.w || 1;
  const h = tile.h || 1;
  // Free the source so the destination check can overlap the old footprint.
  footprintCells(root, w, h).forEach((c) => {
    state.grid[c] = null;
  });
  if (!buildFits(state.grid, dest, w, h)) {
    stampBuild(state.grid, root, tile); // didn't fit — put it back
    return false;
  }
  stampBuild(state.grid, dest, tile);
  return true;
}

// A brand-new farm: an empty grid with a market, an orders board and a small
// cluster of starter soil tiles already placed near the centre.
function freshGrid(): (Tile | null)[] {
  const grid: (Tile | null)[] = new Array(GRID_N).fill(null);
  const at = (col: number, row: number) => row * GRID_COLS + col;
  stampBuild(grid, at(1, 1), { kind: "market", w: 2, h: 2 });
  stampBuild(grid, at(7, 1), { kind: "board", w: 2, h: 2 });
  stampBuild(grid, at(1, 7), { kind: "storage", w: 2, h: 2 });
  stampBuild(grid, at(7, 7), { kind: "research", w: 2, h: 2 });
  [
    [4, 4],
    [5, 4],
    [6, 4],
    [4, 5],
    [5, 5],
    [6, 5],
  ].forEach(([c, r]) => {
    grid[at(c, r)] = freshSoil();
  });
  return grid;
}

export function freshState(): State {
  const pots = [];
  for (let j = 0; j < START_POTS; j++) pots.push(null);
  const s: State = {
    coins: 30,
    xp: 0,
    level: 1,
    sel: "wheat",
    build: false,
    buildSel: "soil",
    moveSrc: null,
    placeAt: null,
    grid: freshGrid(),
    inv: {},
    cap: 40,
    animals: [],
    pens: freshPens(),
    stoves: 1,
    cooks: [null],
    potCap: START_POTS,
    pots,
    hives: [],
    soil: 0,
    sprinkler: 0,
    oven: 0,
    heater: 0,
    trade: 0,
    quests: [],
    prices: {},
    marketUntil: 0,
    tab: "village",
    lastSeen: Date.now(),
  };
  rollMarket(s, true);
  for (let q = 0; q < 3; q++) s.quests.push(makeQuest(s));
  return s;
}

// Clamp a saved footprint dimension to a sane cell count.
function dim(v: any): number {
  return Math.max(1, Math.min(GRID_COLS, Math.floor(+v || 1)));
}

// Rebuild one tile from saved data, dropping anything that no longer validates.
function loadTile(raw: any): Tile | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = raw.kind as TileKind;
  if (!VALID_KINDS[kind]) return null;
  if (kind === "link") {
    const root = +raw.root;
    if (!(root >= 0 && root < GRID_N)) return null;
    return { kind: "link", root };
  }
  if (kind === "soil") {
    const crop = CROP_BY_ID[raw.crop] ? raw.crop : null;
    return {
      kind: "soil",
      crop,
      grown: crop ? Math.max(0, +raw.grown || 0) : 0,
      water: crop ? Math.max(0, +raw.water || 0) : 0,
      fert: crop ? !!raw.fert : false,
    };
  }
  if (kind === "pen") {
    if (!ANIMAL_BY_ID[raw.penType]) return null;
    return { kind: "pen", penType: raw.penType, w: dim(raw.w), h: dim(raw.h) };
  }
  return { kind, w: dim(raw.w), h: dim(raw.h) };
}

export function load(): void {
  assignInto(state, freshState());
  const d = store.load();
  if (d && typeof d === "object") {
    if (typeof d.coins === "number" && d.coins >= 0) state.coins = d.coins;
    if (typeof d.xp === "number" && d.xp >= 0) state.xp = d.xp;
    if (typeof d.level === "number" && d.level >= 1) state.level = d.level;
    if (typeof d.cap === "number" && d.cap > 0) state.cap = d.cap;
    if (typeof d.stoves === "number" && d.stoves >= 1) state.stoves = d.stoves;
    if (typeof d.potCap === "number" && d.potCap >= START_POTS)
      state.potCap = Math.min(MAX_POTS, d.potCap);
    if (typeof d.soil === "number" && d.soil >= 0)
      state.soil = Math.min(MAX_SOIL, Math.floor(d.soil));
    if (typeof d.sprinkler === "number" && d.sprinkler >= 0)
      state.sprinkler = Math.min(MAX_SPRINKLER, Math.floor(d.sprinkler));
    if (typeof d.oven === "number" && d.oven >= 0)
      state.oven = Math.min(MAX_OVEN, Math.floor(d.oven));
    if (typeof d.heater === "number" && d.heater >= 0)
      state.heater = Math.min(MAX_HEATER, Math.floor(d.heater));
    if (typeof d.trade === "number" && d.trade >= 0)
      state.trade = Math.min(MAX_TRADE, Math.floor(d.trade));
    if (CROP_BY_ID[d.sel] || d.sel === "water" || d.sel === "clear" || d.sel === "fert")
      state.sel = d.sel;
    if (typeof d.buildSel === "string") state.buildSel = d.buildSel;

    if (d.inv && typeof d.inv === "object") {
      state.inv = {};
      for (const k in d.inv) if (ITEM[k] && d.inv[k] > 0) state.inv[k] = Math.floor(d.inv[k]);
    }
    if (Array.isArray(d.grid)) {
      for (let i = 0; i < GRID_N; i++) state.grid[i] = loadTile(d.grid[i]);
    }
    if (Array.isArray(d.animals)) {
      state.animals = [];
      const animCounts: Record<string, number> = {};
      d.animals.forEach((a: any) => {
        if (a && ANIMAL_BY_ID[a.type]) {
          animCounts[a.type] = animCounts[a.type] || 0;
          if (animCounts[a.type] >= MAX_PER_ANIMAL) return;
          animCounts[a.type]++;
          state.animals.push({
            type: a.type,
            grown: Math.max(0, +a.grown || 0),
            feedUntil: Math.max(0, +a.feedUntil || 0),
          });
        }
      });
    }
    if (d.pens && typeof d.pens === "object") {
      ANIMALS.forEach((a) => {
        const pd = d.pens[a.id];
        if (pd && typeof pd === "object") {
          state.pens[a.id] = {
            feeder: !!pd.feeder,
            collector: !!pd.collector,
            feed: Math.max(0, Math.min(FEEDER_CAP, Math.floor(+pd.feed || 0))),
          };
        }
      });
    }
    if (Array.isArray(d.cooks)) {
      state.cooks = [];
      for (let c = 0; c < state.stoves; c++) {
        const ck = d.cooks[c];
        if (ck && DISH_BY_ID[ck.dish])
          state.cooks.push({
            dish: ck.dish,
            endsAt: +ck.endsAt || 0,
            total: +ck.total || DISH_BY_ID[ck.dish].cook,
          });
        else state.cooks.push(null);
      }
    } else {
      state.cooks = [];
      for (let c2 = 0; c2 < state.stoves; c2++) state.cooks.push(null);
    }
    state.pots = [];
    for (let pp = 0; pp < state.potCap; pp++) {
      const pt = Array.isArray(d.pots) ? d.pots[pp] : null;
      if (pt && FLOWER_BY_ID[pt.flower])
        state.pots.push({
          flower: pt.flower,
          endsAt: +pt.endsAt || 0,
          total: +pt.total || FLOWER_BY_ID[pt.flower].grow,
        });
      else state.pots.push(null);
    }
    if (Array.isArray(d.hives)) {
      state.hives = [];
      d.hives.forEach((hv: any) => {
        if (state.hives.length < MAX_HIVES)
          state.hives.push({ grown: Math.max(0, +hv?.grown || 0) });
      });
    }
    if (Array.isArray(d.quests) && d.quests.length) {
      state.quests = [];
      d.quests.forEach((q: any) => {
        if (q && ITEM[q.item] && q.need > 0) state.quests.push(q);
      });
      while (state.quests.length < 3) state.quests.push(makeQuest(state));
    }
    // The village (no panel) is the home screen; building panels are transient.
    state.tab = "village";
    state.build = false;
    state.moveSrc = null;
    state.placeAt = null;
  }

  // Offline progress.
  const now = Date.now();
  const away = now - (+d?.lastSeen || now);
  if (away > 0) {
    const offMul = soilMul();
    state.grid.forEach((t) => {
      if (t && t.kind === "soil" && t.crop) {
        const g = CROP_BY_ID[t.crop].grow;
        t.grown = Math.min(g, (t.grown || 0) + away * offMul); // no water bonus offline
        t.water = 0;
      }
    });
    const seen = +d?.lastSeen || now;
    state.animals.forEach((a) => {
      const iv = ANIMAL_BY_ID[a.type].interval;
      let fedTime = Math.max(0, Math.min(now, a.feedUntil) - seen);
      // A stocked feeder keeps animals fed while you're away, spending one
      // feed per FEED_MS until the stock (shared across the pen) runs out.
      const pen = state.pens[a.type];
      if (pen?.feeder && pen.feed > 0) {
        const gap = away - fedTime;
        if (gap > 0) {
          const used = Math.min(pen.feed, Math.ceil(gap / FEED_MS));
          pen.feed -= used;
          fedTime = Math.min(away, fedTime + used * FEED_MS);
        }
      }
      a.grown = Math.min(iv, a.grown + fedTime);
    });
    // Hives keep filling with honey while you're away (no feeding needed).
    state.hives.forEach((hv) => {
      hv.grown = Math.min(HIVE_MS, hv.grown + away);
    });
  }
  rollMarket(state, false);
}

export function save(): void {
  store.save({
    coins: state.coins,
    xp: state.xp,
    level: state.level,
    sel: state.sel,
    buildSel: state.buildSel,
    cap: state.cap,
    stoves: state.stoves,
    potCap: state.potCap,
    soil: state.soil,
    sprinkler: state.sprinkler,
    oven: state.oven,
    heater: state.heater,
    trade: state.trade,
    hives: state.hives.map((hv) => ({ grown: Math.round(hv.grown) })),
    inv: state.inv,
    grid: state.grid.map((t) => {
      if (!t) return null;
      if (t.kind === "link") return { kind: "link", root: t.root };
      if (t.kind === "soil")
        return {
          kind: "soil",
          crop: t.crop,
          grown: Math.round(t.grown || 0),
          water: Math.round(t.water || 0),
          fert: !!t.fert,
        };
      if (t.kind === "pen") return { kind: "pen", penType: t.penType, w: t.w, h: t.h };
      return { kind: t.kind, w: t.w, h: t.h };
    }),
    animals: state.animals.map((a) => ({
      type: a.type,
      grown: Math.round(a.grown),
      feedUntil: a.feedUntil,
    })),
    pens: (() => {
      const o: Record<string, Pen> = {};
      ANIMALS.forEach((a) => {
        const p = state.pens[a.id] || ({} as Pen);
        o[a.id] = { feeder: !!p.feeder, collector: !!p.collector, feed: Math.round(p.feed || 0) };
      });
      return o;
    })(),
    cooks: state.cooks.map((c) => (c ? { dish: c.dish, endsAt: c.endsAt, total: c.total } : null)),
    pots: state.pots.map((p) =>
      p ? { flower: p.flower, endsAt: p.endsAt, total: p.total } : null,
    ),
    quests: state.quests,
    prices: state.prices,
    marketUntil: state.marketUntil,
    tab: state.tab,
    lastSeen: Date.now(),
  });
  dirty = false;
}

// Wipe the farm back to a fresh start (persisted immediately).
export function reset(): void {
  assignInto(state, freshState());
  save();
}

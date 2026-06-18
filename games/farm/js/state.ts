/* ============================================================================
 *  Farm — game state & persistence.
 *
 *  Owns the single canonical `state` object and the versioned save store.
 *  The state object is created once and always *mutated in place* (never
 *  reassigned), so every other module can import a stable reference to it.
 *  `load()` rebuilds it from a save (with offline-progress catch-up and
 *  defensive validation); `reset()` returns it to a fresh farm.
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
  GRID,
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
  START_PLOTS,
  START_POTS,
} from "./config";
import { makeQuest, rollMarket, soilMul } from "./economy";
import type { Pen, State } from "./types";

const store = MG.storage<Record<string, any>>("farm", {
  version: 5,
  migrations: {
    2: (d) => ({ coins: d?.coins || 25 }),
    // 2 → 3: greenhouse, fertiliser and the soil/sprinkler upgrades arrive.
    // Defaults are filled in by load(), so the old save passes through.
    3: (d) => d || {},
    // 3 → 4: apiary (honey), workshop upgrades and the new crops/dishes
    // arrive. load() fills the new defaults, so the old save passes through.
    4: (d) => d || {},
    // 4 → 5: the barn is gone — animals live in per-type pens (up to 9 each)
    // with optional feeders/collectors. The old global barnCap is dropped;
    // load() fills the new per-pen defaults, so the old save passes through.
    5: (d) => d || {},
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

export function freshState(): State {
  const plots = [];
  for (let i = 0; i < GRID; i++) plots.push({ crop: null, grown: 0, water: 0, fert: false });
  const pots = [];
  for (let j = 0; j < START_POTS; j++) pots.push(null);
  const s: State = {
    coins: 25,
    xp: 0,
    level: 1,
    sel: "wheat",
    unlocked: START_PLOTS,
    plots,
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

export function load(): void {
  assignInto(state, freshState());
  const d = store.load();
  if (d && typeof d === "object") {
    if (typeof d.coins === "number" && d.coins >= 0) state.coins = d.coins;
    if (typeof d.xp === "number" && d.xp >= 0) state.xp = d.xp;
    if (typeof d.level === "number" && d.level >= 1) state.level = d.level;
    if (typeof d.unlocked === "number")
      state.unlocked = Math.max(START_PLOTS, Math.min(GRID, d.unlocked));
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

    if (d.inv && typeof d.inv === "object") {
      state.inv = {};
      for (const k in d.inv) if (ITEM[k] && d.inv[k] > 0) state.inv[k] = Math.floor(d.inv[k]);
    }
    if (Array.isArray(d.plots)) {
      for (let i = 0; i < GRID; i++) {
        const p = d.plots[i] || {};
        const crop = CROP_BY_ID[p.crop] ? p.crop : null;
        state.plots[i] = {
          crop,
          grown: crop ? Math.max(0, +p.grown || 0) : 0,
          water: crop ? Math.max(0, +p.water || 0) : 0,
          fert: crop ? !!p.fert : false,
        };
      }
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
    // The village is the home screen; building panels are transient.
    state.tab = "village";
  }

  // Offline progress.
  const now = Date.now();
  const away = now - (+d?.lastSeen || now);
  if (away > 0) {
    const offMul = soilMul();
    state.plots.forEach((pl) => {
      if (pl.crop) {
        const g = CROP_BY_ID[pl.crop].grow;
        pl.grown = Math.min(g, pl.grown + away * offMul); // no water bonus offline
        pl.water = 0;
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
    unlocked: state.unlocked,
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
    plots: state.plots.map((p) => ({
      crop: p.crop,
      grown: Math.round(p.grown),
      water: Math.round(p.water),
      fert: !!p.fert,
    })),
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

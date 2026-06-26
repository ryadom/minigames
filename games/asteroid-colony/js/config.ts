/* ============================================================================
 *  Asteroid Colony — tuning constants, content tables and small grid helpers.
 *
 *  Values are chosen so a fresh single duplicant survives the first cycle if the
 *  player digs out the algae vein and gets a diffuser running early.
 * ========================================================================== */
import type { BuildingDef, BuildingId, JobKind, Material, TileTypeDef } from "./types";

// --- world dimensions ---
export const COLS = 36;
export const ROWS = 24;
export const N = COLS * ROWS;
export const CELL = 26; // px at scale 1
export const SPACE_ROWS = 3; // top rows: vacuum + heat sink, cannot be dug

// --- simulation cadence ---
export const STEP = 250; // ms per fixed sim step (4 Hz)
export const CYCLE_MS = 75_000; // one "cycle" (day) ≈ 75s
export const OFFLINE_CAP_MS = 8 * 3600_000; // clamp offline catch-up to 8h

// --- duplicant needs ---
export const O2_PER_DUPE = 1.0; // g/s breathed from the local cell
export const CO2_PER_DUPE = 0.6; // g/s exhaled into the local cell
export const KCAL_PER_DUPE = 1.0; // kcal/s eaten
export const BREATHE_MIN = 50; // g O2 in a cell below which a dupe can't breathe
export const EAT_AMOUNT = 600; // kcal taken per meal
export const HUNGRY_BELOW = 0.5; // a dupe seeks food once its belly fraction drops below this
export const BELLY_MAX = 1200; // kcal a full belly holds
export const SUFFOCATE_S = 25;
export const STARVE_S = 60;
export const OVERHEAT_S = 30;
export const OVERHEAT_C = 55; // local temp above which heatDebt accrues

// --- duplicant work / movement ---
export const DUPE_SPEED = 4; // cells/s walk speed
export const BUILD_MS = 3000; // ms a dupe spends constructing a building
export const STAMINA_DRAIN = 0.012; // per second awake
export const STAMINA_REST = 0.06; // per second sleeping in a bed
export const TIRED = 0.2; // sleep when stamina drops below this
export const RESTED = 0.95; // wake once stamina reaches this

// --- colony growth ---
export const MAX_DUPES = 6;
export const BIRTH_MORALE = 70; // morale needed to print a new dupe at cycle end
export const BASE_FOOD_CAP = 1500; // colony supply-pod food storage before ration boxes

// --- fields ---
export const CELL_WATER_CAP = 1000; // g water a cell holds before spreading
export const GAS_DIFFUSE = 0.18; // fraction of surplus shared per neighbour per step
export const HEAT_DIFFUSE = 0.12;
export const SPACE_TEMP = -20; // °C the vacuum heat-sink rows are clamped to
export const START_TEMP = 22; // °C of freshly opened cells
export const O2_TARGET = 1000; // g O2 a cell is "full" of for HUD/render scaling

// Errand priority: higher wins when a free dupe picks its next job (survival first).
export const JOB_PRIORITY: Record<JobKind, number> = {
  eat: 4,
  sleep: 3,
  build: 2,
  dig: 1,
};

export const DUPE_GLYPHS = ["🧑‍🚀", "👩‍🚀", "🧑‍🔧", "👨‍🔧", "🧑‍🌾", "👩‍🌾"];

export const TILE_TYPES: TileTypeDef[] = [
  { id: "dirt", ico: "", color: "#5a4632", hardness: 600, yields: { dirt: 1 } },
  { id: "rock", ico: "", color: "#6b6b73", hardness: 1400, yields: { rock: 1 } },
  { id: "algaeRock", ico: "🟢", color: "#3f6b4a", hardness: 900, yields: { algae: 2, dirt: 1 } },
  { id: "oreRock", ico: "🟤", color: "#7a5a3a", hardness: 1500, yields: { ore: 2, rock: 1 } },
  { id: "coalRock", ico: "⚫", color: "#3a3a40", hardness: 1300, yields: { coal: 2 } },
  {
    id: "iceRock",
    ico: "🧊",
    color: "#7fb6d6",
    hardness: 800,
    yields: { water: 1 },
    releasesWater: 600,
  },
  { id: "obsidian", ico: "⬛", color: "#26262c", hardness: 4000, yields: { rock: 2 } },
];

// power<0 consumes, >0 produces; o2/co2/heat are per-second deltas to the cell.
export const BUILDINGS: BuildingDef[] = [
  {
    id: "diffuser",
    ico: "💨",
    cost: { ore: 5, dirt: 5 },
    power: -12,
    o2: 2.0,
    heat: 0.4,
    input: { algae: 0.12 },
  },
  {
    id: "electrolyzer",
    ico: "⚗️",
    cost: { ore: 10, rock: 5 },
    power: -20,
    o2: 2.8,
    heat: 0.8,
    input: { water: 1.5 },
    floor: true,
  },
  { id: "scrubber", ico: "🌀", cost: { ore: 6 }, power: -8, co2: -2.5, heat: 0.3, floor: true },
  { id: "mealwood", ico: "🌱", cost: { dirt: 10 }, power: 0, food: 0.9, tempMax: 40, floor: true },
  { id: "rationBox", ico: "📦", cost: { dirt: 5 }, power: 0, foodStore: 1500, floor: true },
  { id: "bed", ico: "🛏️", cost: { dirt: 8 }, power: 0, sleep: true, floor: true },
  {
    id: "generator",
    ico: "🔌",
    cost: { ore: 10, rock: 8 },
    power: 40,
    heat: 1.6,
    input: { coal: 0.2 },
    floor: true,
  },
  { id: "battery", ico: "🔋", cost: { ore: 8 }, power: 0, batteryCap: 20_000, floor: true },
  { id: "cooler", ico: "❄️", cost: { ore: 6 }, power: 0, heat: -1.2 },
];

export const TILE_BY_ID: Record<string, TileTypeDef> = Object.fromEntries(
  TILE_TYPES.map((t) => [t.id, t]),
);
export const BUILD_BY_ID: Record<string, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b]),
);

export const ALL_MATERIALS: Material[] = ["dirt", "rock", "algae", "ore", "water", "coal"];

export const idx = (c: number, r: number): number => r * COLS + c;
export const colOf = (i: number): number => i % COLS;
export const rowOf = (i: number): number => Math.floor(i / COLS);
export const inGrid = (c: number, r: number): boolean => c >= 0 && c < COLS && r >= 0 && r < ROWS;

/** A tiny deterministic PRNG (mulberry32) so world-gen is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cost of a building as a readable "5 ore · 5 dirt" style string source. */
export function costEntries(id: BuildingId): [Material, number][] {
  const def = BUILD_BY_ID[id];
  return Object.entries(def.cost) as [Material, number][];
}

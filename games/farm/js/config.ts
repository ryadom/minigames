/* ============================================================================
 *  Farm — configuration & content.
 *
 *  Defines the static content of the game as ES module exports: tuning
 *  constants, the crop / flower / product / animal / dish tables, and the
 *  lookup maps derived from them. Other modules import directly from here.
 *
 *  Growth / production / cooking are all time-based (timestamps or accumulated
 *  game-ms) so progress advances across sessions.
 * ========================================================================== */
import type { Animal, BuildDef, Crop, Dish, Flower, Item, Product } from "./types";

// ---- Tiny generic helpers ----
export function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}
export function esc(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ======================================================================
 *  CONTENT TABLES
 * ==================================================================== */

// Crops: seed cost (coins), grow time (ms), base sell price, xp on harvest.
export const CROPS: Crop[] = [
  { id: "wheat", ico: "🌾", seed: 3, grow: 16000, sell: 5, xp: 1, lvl: 1 },
  { id: "carrot", ico: "🥕", seed: 6, grow: 28000, sell: 11, xp: 2, lvl: 1 },
  { id: "potato", ico: "🥔", seed: 9, grow: 44000, sell: 17, xp: 3, lvl: 2 },
  { id: "tomato", ico: "🍅", seed: 12, grow: 52000, sell: 22, xp: 4, lvl: 3 },
  { id: "corn", ico: "🌽", seed: 15, grow: 64000, sell: 27, xp: 4, lvl: 4 },
  { id: "strawberry", ico: "🍓", seed: 20, grow: 80000, sell: 36, xp: 5, lvl: 5 },
  { id: "blueberry", ico: "🫐", seed: 24, grow: 96000, sell: 46, xp: 6, lvl: 6 },
  { id: "pumpkin", ico: "🎃", seed: 28, grow: 120000, sell: 56, xp: 7, lvl: 7 },
  { id: "eggplant", ico: "🍆", seed: 34, grow: 140000, sell: 70, xp: 9, lvl: 8 },
  { id: "grape", ico: "🍇", seed: 44, grow: 168000, sell: 92, xp: 11, lvl: 10 },
  { id: "chili", ico: "🌶️", seed: 52, grow: 150000, sell: 112, xp: 13, lvl: 11 },
  { id: "watermelon", ico: "🍉", seed: 66, grow: 196000, sell: 145, xp: 16, lvl: 12 },
  { id: "pineapple", ico: "🍍", seed: 84, grow: 244000, sell: 186, xp: 20, lvl: 14 },
];

// Flowers: grown in greenhouse pots (no water needed), high value, prized
// by orders. Like dishes, a pot runs on an end timestamp.
export const FLOWERS: Flower[] = [
  { id: "tulip", ico: "🌷", seed: 18, grow: 60000, sell: 30, xp: 5, lvl: 5 },
  { id: "rose", ico: "🌹", seed: 30, grow: 110000, sell: 56, xp: 8, lvl: 7 },
  { id: "sunflower", ico: "🌻", seed: 46, grow: 165000, sell: 88, xp: 12, lvl: 9 },
  { id: "daisy", ico: "🌼", seed: 60, grow: 140000, sell: 112, xp: 14, lvl: 11 },
  { id: "lotus", ico: "🪷", seed: 80, grow: 186000, sell: 152, xp: 18, lvl: 13 },
];

// Products come from animals.
export const PRODUCTS: Product[] = [
  { id: "egg", ico: "🥚", sell: 14, xp: 2 },
  { id: "milk", ico: "🥛", sell: 26, xp: 3 },
  { id: "wool", ico: "🧶", sell: 34, xp: 4 },
  { id: "truffle", ico: "🍄", sell: 52, xp: 6 },
  { id: "honey", ico: "🍯", sell: 40, xp: 5 },
];

// Animals: kept in pens out on the map, fed a crop, produce a product on a timer.
export const ANIMALS: Animal[] = [
  { id: "chicken", ico: "🐔", cost: 45, prod: "egg", feed: "wheat", interval: 30000, lvl: 2 },
  { id: "cow", ico: "🐄", cost: 130, prod: "milk", feed: "corn", interval: 70000, lvl: 4 },
  { id: "sheep", ico: "🐑", cost: 175, prod: "wool", feed: "carrot", interval: 95000, lvl: 6 },
  { id: "pig", ico: "🐖", cost: 240, prod: "truffle", feed: "potato", interval: 120000, lvl: 8 },
];

// Dishes: cooked from a recipe in the kitchen, worth far more than raw goods.
export const DISHES: Dish[] = [
  { id: "bread", ico: "🍞", cook: 22000, sell: 20, xp: 3, lvl: 2, recipe: { wheat: 2 } },
  {
    id: "salad",
    ico: "🥗",
    cook: 28000,
    sell: 44,
    xp: 5,
    lvl: 3,
    recipe: { carrot: 1, tomato: 1 },
  },
  {
    id: "omelette",
    ico: "🍳",
    cook: 34000,
    sell: 66,
    xp: 7,
    lvl: 4,
    recipe: { egg: 2, tomato: 1 },
  },
  {
    id: "soup",
    ico: "🍲",
    cook: 42000,
    sell: 90,
    xp: 9,
    lvl: 5,
    recipe: { potato: 1, carrot: 1, corn: 1 },
  },
  {
    id: "pizza",
    ico: "🍕",
    cook: 50000,
    sell: 124,
    xp: 12,
    lvl: 6,
    recipe: { wheat: 1, tomato: 1, milk: 1 },
  },
  {
    id: "cake",
    ico: "🍰",
    cook: 56000,
    sell: 150,
    xp: 14,
    lvl: 6,
    recipe: { wheat: 1, egg: 1, milk: 1 },
  },
  {
    id: "burger",
    ico: "🍔",
    cook: 60000,
    sell: 168,
    xp: 15,
    lvl: 7,
    recipe: { wheat: 1, tomato: 1, eggplant: 1 },
  },
  {
    id: "pie",
    ico: "🥧",
    cook: 64000,
    sell: 190,
    xp: 17,
    lvl: 7,
    recipe: { pumpkin: 1, egg: 1, wheat: 1 },
  },
  {
    id: "icecream",
    ico: "🍨",
    cook: 58000,
    sell: 210,
    xp: 19,
    lvl: 8,
    recipe: { milk: 1, strawberry: 1, blueberry: 1 },
  },
  { id: "juice", ico: "🧃", cook: 48000, sell: 240, xp: 22, lvl: 10, recipe: { grape: 2 } },
  {
    id: "honeytea",
    ico: "🍵",
    cook: 42000,
    sell: 150,
    xp: 14,
    lvl: 8,
    recipe: { honey: 1, strawberry: 1 },
  },
  {
    id: "pancake",
    ico: "🥞",
    cook: 54000,
    sell: 186,
    xp: 16,
    lvl: 9,
    recipe: { wheat: 1, egg: 1, honey: 1 },
  },
  {
    id: "taco",
    ico: "🌮",
    cook: 60000,
    sell: 216,
    xp: 19,
    lvl: 12,
    recipe: { corn: 1, tomato: 1, chili: 1 },
  },
];

// Master item table (everything that can sit in storage).
export const ITEM: Record<string, Item> = {};
CROPS.forEach((c) => {
  ITEM[c.id] = { id: c.id, ico: c.ico, sell: c.sell, kind: "crop" };
});
FLOWERS.forEach((f) => {
  ITEM[f.id] = { id: f.id, ico: f.ico, sell: f.sell, kind: "flower" };
});
PRODUCTS.forEach((p) => {
  ITEM[p.id] = { id: p.id, ico: p.ico, sell: p.sell, kind: "product" };
});
DISHES.forEach((d) => {
  ITEM[d.id] = { id: d.id, ico: d.ico, sell: d.sell, kind: "dish" };
});

export const CROP_BY_ID: Record<string, Crop> = {};
CROPS.forEach((c) => {
  CROP_BY_ID[c.id] = c;
});
export const FLOWER_BY_ID: Record<string, Flower> = {};
FLOWERS.forEach((f) => {
  FLOWER_BY_ID[f.id] = f;
});
export const PROD_BY_ID: Record<string, Product> = {};
PRODUCTS.forEach((p) => {
  PROD_BY_ID[p.id] = p;
});
export const ANIMAL_BY_ID: Record<string, Animal> = {};
ANIMALS.forEach((a) => {
  ANIMAL_BY_ID[a.id] = a;
});
export const DISH_BY_ID: Record<string, Dish> = {};
DISHES.forEach((d) => {
  DISH_BY_ID[d.id] = d;
});
export const ANIMAL_FOR_PROD: Record<string, Animal> = {};
ANIMALS.forEach((a) => {
  ANIMAL_FOR_PROD[a.prod] = a;
});

// Growth sprite stages.
export const SEED_SPRITE = "🌰";
export const SPROUT_SPRITE = "🌱";
export const LEAF_SPRITE = "🌿";

/* ======================================================================
 *  BUILD CATALOG — everything the player can place on the world grid.
 *  Soil tiles host crops; the shops & pens open their management panels.
 *  `unique` builds may be placed only once; `pen` ties a build to an animal.
 * ==================================================================== */
export const BUILDS: BuildDef[] = [
  { id: "soil", ico: "🟫", cost: 0, lvl: 1, unique: false },
  { id: "market", ico: "🏪", cost: 0, lvl: 1, unique: true },
  { id: "board", ico: "🪧", cost: 50, lvl: 1, unique: true },
  { id: "kitchen", ico: "🍳", cost: 120, lvl: 2, unique: true },
  { id: "greenhouse", ico: "🌻", cost: 240, lvl: 5, unique: true },
  { id: "apiary", ico: "🐝", cost: 300, lvl: 5, unique: true },
  { id: "pen-chicken", ico: "🐔", cost: 60, lvl: 2, unique: true, pen: "chicken" },
  { id: "pen-cow", ico: "🐄", cost: 150, lvl: 4, unique: true, pen: "cow" },
  { id: "pen-sheep", ico: "🐑", cost: 200, lvl: 6, unique: true, pen: "sheep" },
  { id: "pen-pig", ico: "🐖", cost: 280, lvl: 8, unique: true, pen: "pig" },
];
export const BUILD_BY_ID: Record<string, BuildDef> = {};
BUILDS.forEach((b) => {
  BUILD_BY_ID[b.id] = b;
});
// The special "demolish" tool the build toolbar carries after the catalog.
export const REMOVE_TOOL = "remove";

// ---- Tuning constants ----
export const GRID_COLS = 7; // world grid is GRID_COLS × GRID_ROWS cells
export const GRID_ROWS = 7;
export const GRID_N = GRID_COLS * GRID_ROWS;
export const SOIL_BASE_COST = 30; // first extra soil tile
export const SOIL_STEP_COST = 18; // each further soil tile costs this much more
export const WATER_BOOST = 2; // growth multiplier while watered
export const WATER_MS = 12000; // how long a watering lasts (game-time)
export const FEED_MS = 55000; // how long one feeding keeps an animal producing
export const MAX_PER_ANIMAL = 9; // each pen holds up to this many of its own animal
export const FEEDER_CAP = 20; // feed crops a pen's feeder can hold
export const MARKET_MS = 180000; // how often market prices re-roll
export const FERT_COST = 10; // coins to fertilise a plot (doubles its yield)
export const START_POTS = 2; // greenhouse pots you begin with
export const MAX_POTS = 6; // greenhouse pot cap
export const SOIL_STEP = 0.08; // Rich Soil: growth speed gained per level
export const MAX_SOIL = 8;
export const MAX_SPRINKLER = 4;
// Apiary: beehives passively make honey on a timer (no feeding). Like
// animals, a hive accumulates up to HIVE_MS then offers honey to collect.
export const APIARY_LVL = 5; // level the apiary (and first hive) unlocks at
export const HIVE_MS = 60000; // time one hive takes to fill with honey
export const MAX_HIVES = 5;
// Workshop upgrades (sold at the Market) that tune timings and trade.
export const OVEN_STEP = 0.1;
export const MAX_OVEN = 5; // each level: dishes cook faster
export const HEATER_STEP = 0.1;
export const MAX_HEATER = 5; // each level: flowers grow faster
export const TRADE_STEP = 0.06;
export const MAX_TRADE = 5; // each level: +% on every sale

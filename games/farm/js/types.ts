/* ============================================================================
 *  Farm — shared TypeScript types.
 *
 *  Interfaces for the content tables (crops / flowers / products / animals /
 *  dishes), the canonical game state and its sub-records (plots, animals,
 *  pens, stoves, pots, hives, quests, market), and the small DOM-ref bundle
 *  the modules bind at boot. Kept in its own module so every other module can
 *  import just the shapes it needs without dragging in runtime code.
 * ========================================================================== */
import type { HeaderUI } from "../../../shared/types";

/* ----------------------------- Content tables ----------------------------- */

/** A crop the player can plant in the field. */
export interface Crop {
  id: string;
  ico: string;
  seed: number;
  grow: number;
  sell: number;
  xp: number;
  lvl: number;
}

/** A flower grown in greenhouse pots (no water, runs on an end timestamp). */
export interface Flower {
  id: string;
  ico: string;
  seed: number;
  grow: number;
  sell: number;
  xp: number;
  lvl: number;
}

/** A product yielded by an animal or hive. */
export interface Product {
  id: string;
  ico: string;
  sell: number;
  xp: number;
}

/** An animal kept in a pen: fed a crop, produces a product on a timer. */
export interface Animal {
  id: string;
  ico: string;
  cost: number;
  prod: string;
  feed: string;
  interval: number;
  lvl: number;
}

/** A recipe: item id → quantity required. */
export type Recipe = Record<string, number>;

/** A dish cooked from a recipe in the kitchen. */
export interface Dish {
  id: string;
  ico: string;
  cook: number;
  sell: number;
  xp: number;
  lvl: number;
  recipe: Recipe;
}

export type ItemKind = "crop" | "flower" | "product" | "dish";

/** A row in the master item table (anything that can sit in storage). */
export interface Item {
  id: string;
  ico: string;
  sell: number;
  kind: ItemKind;
}

/** A placeable build (soil / shop / pen) in the build catalog. */
export interface BuildDef {
  id: string;
  ico: string;
  cost: number;
  lvl: number;
  unique: boolean;
  /** Footprint in grid cells (defaults to 1×1). */
  w: number;
  h: number;
  pen?: string;
}

/* ------------------------------- Game state ------------------------------- */

/** What occupies a grid cell. A `link` cell is part of a larger building's
 *  footprint and points back to its root (top-left) cell. */
export type TileKind =
  | "soil"
  | "market"
  | "storage"
  | "research"
  | "board"
  | "kitchen"
  | "greenhouse"
  | "apiary"
  | "pen"
  | "link";

/** A single placed tile on the world grid (null cell = empty grass).
 *
 *  Buildings larger than 1×1 occupy a rectangle of cells: the top-left cell is
 *  the "root" (carrying the real `kind` plus its `w`/`h` footprint) and every
 *  other covered cell is a `link` tile whose `root` is the root cell's index. */
export interface Tile {
  kind: TileKind;
  /* footprint (root tile; defaults to 1×1) */
  w?: number;
  h?: number;
  /* link tile → index of the root cell it belongs to */
  root?: number;
  /* soil */
  crop?: string | null;
  grown?: number;
  water?: number;
  fert?: boolean;
  /* pen */
  penType?: string;
}

/** A living animal instance out in a pen. */
export interface AnimalInstance {
  type: string;
  grown: number;
  feedUntil: number;
}

/** Per-pen automation: an optional feeder + collector and a feed stock. */
export interface Pen {
  feeder: boolean;
  collector: boolean;
  feed: number;
}

/** A stove slot in the kitchen (null when free). */
export interface Cook {
  dish: string;
  endsAt: number;
  total: number;
}

/** A greenhouse pot (null when free). */
export interface Pot {
  flower: string;
  endsAt: number;
  total: number;
}

/** A beehive in the apiary. */
export interface Hive {
  grown: number;
}

/** An order the player can fill for coins + XP. */
export interface Quest {
  item: string;
  need: number;
  coins: number;
  xp: number;
}

/** Market multipliers keyed by item id. */
export type Prices = Record<string, number>;

/** The single canonical game state — created once, mutated in place. */
export interface State {
  coins: number;
  xp: number;
  level: number;
  sel: string;
  build: boolean;
  buildSel: string;
  /** Build mode "move" tool: root cell of the building currently picked up
   *  (null when nothing is held). Transient — never persisted. */
  moveSrc?: number | null;
  /** Build mode placement: root cell of the pending build preview (the ghost
   *  the player can reposition before confirming). Transient — never persisted. */
  placeAt?: number | null;
  grid: (Tile | null)[];
  inv: Record<string, number>;
  cap: number;
  animals: AnimalInstance[];
  pens: Record<string, Pen>;
  stoves: number;
  cooks: (Cook | null)[];
  potCap: number;
  pots: (Pot | null)[];
  hives: Hive[];
  soil: number;
  sprinkler: number;
  oven: number;
  heater: number;
  trade: number;
  quests: Quest[];
  prices: Prices;
  marketUntil: number;
  tab: string;
  penType?: string;
  lastSeen: number;
}

/* --------------------------- Sweep aggregation ---------------------------- */

/** Accumulates what a hold-and-sweep gesture did, for one summary toast. */
export interface Agg {
  harvest: Record<string, number>;
  collect: Record<string, number>;
  plant: number;
  water: number;
  clear: number;
  fed: number;
  fert: number;
  full: boolean;
  needCoins: boolean;
  needLevel: number;
}

/* ------------------------------ Boot runtime ------------------------------ */

/** The DOM refs the modules bind once at boot. */
export interface Dom {
  worldView: HTMLElement;
  world: HTMLElement;
  toolbar: HTMLElement;
  overlay: HTMLElement;
  toast: HTMLElement;
  panHint: HTMLElement;
  lvl: HTMLElement;
  xpfill: HTMLElement;
  store: HTMLElement;
}

export type { HeaderUI };

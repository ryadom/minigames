/* ============================================================================
 *  Asteroid Colony — shared TypeScript types.
 *
 *  An Oxygen Not Included–inspired survival sim. The world is a tile grid; open
 *  (dug-out) cells carry simulated fields — oxygen, carbon dioxide, water and
 *  temperature — that diffuse/flow between neighbours each step. Duplicants take
 *  errands from a job queue (dig, build, sleep, eat) rather than acting instantly.
 * ========================================================================== */

/** Loose materials produced by digging and consumed by building / machines. */
export type Material = "dirt" | "rock" | "algae" | "ore" | "water" | "coal";

/** Solid tile kinds that fill un-dug cells. */
export type TileSolid =
  | "dirt"
  | "rock"
  | "algaeRock"
  | "oreRock"
  | "coalRock"
  | "iceRock"
  | "obsidian";

/** Placeable machines / furniture. */
export type BuildingId =
  | "diffuser"
  | "electrolyzer"
  | "scrubber"
  | "mealwood"
  | "rationBox"
  | "bed"
  | "generator"
  | "battery"
  | "cooler";

export type ToolId = "dig" | "build" | "cancel";
export type ViewMode = "normal" | "oxygen" | "heat";

/** Static definition of a solid tile type. */
export interface TileTypeDef {
  id: TileSolid;
  ico: string;
  color: string;
  /** Dig effort in ms before the cell opens up. */
  hardness: number;
  /** Loose materials dropped into stock when dug. */
  yields: Partial<Record<Material, number>>;
  /** If set, opening this cell fills it with this much water (grams). */
  releasesWater?: number;
}

/** Static definition of a building. Per-second deltas apply while powered + supplied. */
export interface BuildingDef {
  id: BuildingId;
  ico: string;
  /** Materials consumed to construct it. */
  cost: Partial<Record<Material, number>>;
  /** Net power: <0 consumes watts, >0 produces watts. */
  power: number;
  /** O2 added to its cell (g/s). */
  o2?: number;
  /** CO2 delta to its cell (g/s); negative removes (scrubber). */
  co2?: number;
  /** Heat delta to its cell (°C/s); negative cools (cooler). */
  heat?: number;
  /** Food produced into the store (kcal/s) once grown. */
  food?: number;
  /** Storage added to the colony food cap (kcal). */
  foodStore?: number;
  /** Storage added to the colony battery cap (joules). */
  batteryCap?: number;
  /** A bed: a sleep slot for one duplicant. */
  sleep?: boolean;
  /** Material inputs consumed per second while running. */
  input?: Partial<Record<Material, number>>;
  /** Plant dies / stops if its cell is hotter than this (°C). */
  tempMax?: number;
  /** Must sit on a cell with a solid floor directly below. */
  floor?: boolean;
}

/** A single grid cell. Field values only matter where `solid === null`. */
export interface Tile {
  solid: TileSolid | null;
  marked?: boolean;
  digProgress?: number;
  build?: BuildingId | null;
  blueprint?: BuildingId | null;
  buildProgress?: number;
  /** Powered + supplied this tick (render tint). */
  on?: boolean;
  /** Mealwood growth in ms toward the next harvest. */
  grow?: number;
  // --- fields (open cells) ---
  o2: number;
  co2: number;
  water: number;
  temp: number;
}

/** A queued errand. dig/build come from player intents; sleep/eat are self-issued. */
export type JobKind = "dig" | "build" | "sleep" | "eat";

export interface Job {
  kind: JobKind;
  /** Target cell: the solid to dig, the blueprint to build, the bed or ration box. */
  cell: number;
  /** Index of the duplicant working it (one dupe per job). */
  claimedBy: number | null;
}

export interface Duplicant {
  /** Continuous position in cell units (for smooth walking). */
  cx: number;
  cy: number;
  /** Target cell of the current job. */
  tx: number;
  ty: number;
  job: Job | null;
  /** kcal in the belly; drains while alive, refilled by eating. Empty → starving. */
  belly: number;
  /** 0..1 — drains while awake, restored by sleeping in a bed. */
  stamina: number;
  /** Seconds spent in deficit; crossing a threshold kills the dupe. */
  o2Debt: number;
  foodDebt: number;
  heatDebt: number;
  alive: boolean;
  glyph: string;
}

export interface State {
  cols: number;
  rows: number;
  grid: Tile[];
  dupes: Duplicant[];
  food: number;
  foodCap: number;
  stock: Record<Material, number>;
  power: number;
  battery: number;
  batteryCap: number;
  cycle: number;
  cycleMs: number;
  morale: number;
  tool: ToolId;
  buildSel: BuildingId;
  view: ViewMode;
  selCell: number | null;
  deaths: number;
  best: number;
  lastSeen: number;
}

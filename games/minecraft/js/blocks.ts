/* ==========================================================================
   Block + texture-tile definitions.

   Blocks are identified by a small integer (stored one byte per voxel).
   Each block maps its top / bottom / side faces to a tile in the texture
   atlas built in textures.ts. A handful of flags drive world generation,
   meshing (which faces to cull) and collision. Each block also carries
   mining metadata (how long it takes to break by hand and which tool speeds
   that up) used by the hold-to-mine progress in main.ts.
   ========================================================================== */

// --- Block ids (0 = air) ---
export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const COBBLE = 4;
export const SAND = 5;
export const LOG = 6;
export const LEAVES = 7;
export const PLANKS = 8;
export const WATER = 9;
export const GLASS = 10;
export const BRICK = 11;
export const CRAFT = 12; // crafting table

// --- Atlas tile indices (must match the draw order in textures.ts) ---
export const T_GRASS_TOP = 0;
export const T_GRASS_SIDE = 1;
export const T_DIRT = 2;
export const T_STONE = 3;
export const T_COBBLE = 4;
export const T_SAND = 5;
export const T_LOG_SIDE = 6;
export const T_LOG_TOP = 7;
export const T_LEAVES = 8;
export const T_PLANKS = 9;
export const T_WATER = 10;
export const T_GLASS = 11;
export const T_BRICK = 12;
export const T_CRAFT_TOP = 13;
export const T_CRAFT_SIDE = 14;
export const T_STICK = 15;
export const T_PICKAXE = 16;
export const T_AXE = 17;
export const T_SWORD = 18;
export const TILE_COUNT = 19;

export type FaceKind = "top" | "bottom" | "side";
export type ToolType = "pickaxe" | "axe" | "sword" | null;

interface BlockDef {
  top: number;
  bottom: number;
  side: number;
  /** Fully hides the faces of neighbours touching it (opaque solid). */
  opaque: boolean;
  /** Drawn in the translucent pass (water, glass). */
  translucent: boolean;
  /** Blocks player movement. */
  solid: boolean;
  /** Per-vertex alpha multiplier used in the translucent pass. */
  alpha: number;
  /** Seconds to break by hand (with no effective tool). 0 = unbreakable. */
  hardness: number;
  /** Tool that breaks this block faster (or null if none helps). */
  tool: ToolType;
}

interface BlockOpts {
  hardness?: number;
  tool?: ToolType;
}

const DEFS: Record<number, BlockDef> = {
  [GRASS]: t(T_GRASS_TOP, T_DIRT, T_GRASS_SIDE, { hardness: 0.6 }),
  [DIRT]: u(T_DIRT, { hardness: 0.6 }),
  [STONE]: u(T_STONE, { hardness: 2.4, tool: "pickaxe" }),
  [COBBLE]: u(T_COBBLE, { hardness: 2.4, tool: "pickaxe" }),
  [SAND]: u(T_SAND, { hardness: 0.6 }),
  [LOG]: t(T_LOG_TOP, T_LOG_TOP, T_LOG_SIDE, { hardness: 1.6, tool: "axe" }),
  [LEAVES]: u(T_LEAVES, { hardness: 0.3, tool: "sword" }),
  [PLANKS]: u(T_PLANKS, { hardness: 1.4, tool: "axe" }),
  [BRICK]: u(T_BRICK, { hardness: 2.4, tool: "pickaxe" }),
  [CRAFT]: {
    top: T_CRAFT_TOP,
    bottom: T_PLANKS,
    side: T_CRAFT_SIDE,
    opaque: true,
    translucent: false,
    solid: true,
    alpha: 1,
    hardness: 1.4,
    tool: "axe",
  },
  [WATER]: {
    top: T_WATER,
    bottom: T_WATER,
    side: T_WATER,
    opaque: false,
    translucent: true,
    solid: false,
    alpha: 0.72,
    hardness: 0,
    tool: null,
  },
  [GLASS]: {
    top: T_GLASS,
    bottom: T_GLASS,
    side: T_GLASS,
    opaque: false,
    translucent: true,
    solid: true,
    alpha: 1,
    hardness: 0.4,
    tool: null,
  },
};

/** Opaque solid where every face shows the same tile. */
function u(tile: number, opts: BlockOpts = {}): BlockDef {
  return {
    top: tile,
    bottom: tile,
    side: tile,
    opaque: true,
    translucent: false,
    solid: true,
    alpha: 1,
    hardness: opts.hardness ?? 1,
    tool: opts.tool ?? null,
  };
}

/** Opaque solid with distinct top / bottom / side tiles. */
function t(top: number, bottom: number, side: number, opts: BlockOpts = {}): BlockDef {
  return {
    top,
    bottom,
    side,
    opaque: true,
    translucent: false,
    solid: true,
    alpha: 1,
    hardness: opts.hardness ?? 1,
    tool: opts.tool ?? null,
  };
}

export function tileFor(block: number, kind: FaceKind): number {
  return DEFS[block][kind];
}

export function isOpaque(block: number): boolean {
  return block !== AIR && DEFS[block].opaque;
}

export function isTranslucent(block: number): boolean {
  return block !== AIR && DEFS[block].translucent;
}

export function isSolid(block: number): boolean {
  return block !== AIR && DEFS[block].solid;
}

export function alphaOf(block: number): number {
  return block === AIR ? 1 : DEFS[block].alpha;
}

/** Seconds to break a block with the given tool (0 = can't be mined). */
export function breakTime(block: number, tool: ToolType): number {
  const def = DEFS[block];
  if (!def || def.hardness <= 0) return 0;
  const matched = def.tool !== null && def.tool === tool;
  return def.hardness * (matched ? 0.25 : 1);
}

/**
 * Whether `neighbour` hides the face of `self`. Opaque neighbours always
 * hide; a translucent block only hides faces against the *same* block type
 * (so water doesn't draw internal walls, but a glass face beside water shows).
 */
export function occludes(neighbour: number, self: number): boolean {
  if (neighbour === AIR) return false;
  if (isOpaque(neighbour)) return true;
  return neighbour === self;
}

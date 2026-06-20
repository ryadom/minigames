/* ==========================================================================
   Block + texture-tile definitions.

   Blocks are identified by a small integer (stored one byte per voxel).
   Each block maps its top / bottom / side faces to a tile in the texture
   atlas built in textures.ts. A handful of flags drive world generation,
   meshing (which faces to cull) and collision.
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
export const TILE_COUNT = 13;

export type FaceKind = "top" | "bottom" | "side";

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
}

const DEFS: Record<number, BlockDef> = {
  [GRASS]: t(T_GRASS_TOP, T_DIRT, T_GRASS_SIDE),
  [DIRT]: u(T_DIRT),
  [STONE]: u(T_STONE),
  [COBBLE]: u(T_COBBLE),
  [SAND]: u(T_SAND),
  [LOG]: t(T_LOG_TOP, T_LOG_TOP, T_LOG_SIDE),
  [LEAVES]: u(T_LEAVES),
  [PLANKS]: u(T_PLANKS),
  [BRICK]: u(T_BRICK),
  [WATER]: {
    top: T_WATER,
    bottom: T_WATER,
    side: T_WATER,
    opaque: false,
    translucent: true,
    solid: false,
    alpha: 0.72,
  },
  [GLASS]: {
    top: T_GLASS,
    bottom: T_GLASS,
    side: T_GLASS,
    opaque: false,
    translucent: true,
    solid: true,
    alpha: 1,
  },
};

/** Opaque solid where every face shows the same tile. */
function u(tile: number): BlockDef {
  return {
    top: tile,
    bottom: tile,
    side: tile,
    opaque: true,
    translucent: false,
    solid: true,
    alpha: 1,
  };
}

/** Opaque solid with distinct top / bottom / side tiles. */
function t(top: number, bottom: number, side: number): BlockDef {
  return { top, bottom, side, opaque: true, translucent: false, solid: true, alpha: 1 };
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

/** Blocks offered in the hotbar, with the tile used for the slot icon. */
export const HOTBAR: { block: number; icon: number; nameKey: string }[] = [
  { block: GRASS, icon: T_GRASS_SIDE, nameKey: "b.grass" },
  { block: DIRT, icon: T_DIRT, nameKey: "b.dirt" },
  { block: STONE, icon: T_STONE, nameKey: "b.stone" },
  { block: COBBLE, icon: T_COBBLE, nameKey: "b.cobble" },
  { block: SAND, icon: T_SAND, nameKey: "b.sand" },
  { block: LOG, icon: T_LOG_SIDE, nameKey: "b.log" },
  { block: PLANKS, icon: T_PLANKS, nameKey: "b.planks" },
  { block: LEAVES, icon: T_LEAVES, nameKey: "b.leaves" },
  { block: BRICK, icon: T_BRICK, nameKey: "b.brick" },
  { block: GLASS, icon: T_GLASS, nameKey: "b.glass" },
];

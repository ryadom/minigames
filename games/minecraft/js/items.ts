/* ==========================================================================
   Item registry.

   Everything that can sit in the inventory is an "item" identified by a short
   string id. Items are either placeable blocks (which carry the block id they
   place), crafting materials (sticks) or tools (pickaxe / axe / sword). Each
   item knows the atlas tile used to draw its icon and how high it stacks.
   ========================================================================== */

import {
  BRICK,
  COBBLE,
  CRAFT,
  DIRT,
  GLASS,
  GRASS,
  LEAVES,
  LOG,
  PLANKS,
  SAND,
  STONE,
  T_AXE,
  T_BRICK,
  T_COBBLE,
  T_CRAFT_SIDE,
  T_DIRT,
  T_GLASS,
  T_GRASS_SIDE,
  T_LEAVES,
  T_LOG_SIDE,
  T_PICKAXE,
  T_PLANKS,
  T_SAND,
  T_STICK,
  T_STONE,
  T_SWORD,
  type ToolType,
} from "./blocks";

export type ItemKind = "block" | "material" | "tool";

export interface ItemDef {
  id: string;
  nameKey: string;
  /** Atlas tile used for the inventory / hotbar icon. */
  icon: number;
  kind: ItemKind;
  /** Block placed when this item is used (only for `block` items). */
  block?: number;
  /** Tool behaviour this item provides when held (only for `tool` items). */
  tool?: ToolType;
  maxStack: number;
}

function blockItem(id: string, block: number, icon: number, nameKey: string): ItemDef {
  return { id, nameKey, icon, kind: "block", block, maxStack: 64 };
}

function tool(id: string, tType: ToolType, icon: number, nameKey: string): ItemDef {
  return { id, nameKey, icon, kind: "tool", tool: tType, maxStack: 1 };
}

export const ITEMS: Record<string, ItemDef> = {
  grass: blockItem("grass", GRASS, T_GRASS_SIDE, "b.grass"),
  dirt: blockItem("dirt", DIRT, T_DIRT, "b.dirt"),
  stone: blockItem("stone", STONE, T_STONE, "b.stone"),
  cobble: blockItem("cobble", COBBLE, T_COBBLE, "b.cobble"),
  sand: blockItem("sand", SAND, T_SAND, "b.sand"),
  log: blockItem("log", LOG, T_LOG_SIDE, "b.log"),
  planks: blockItem("planks", PLANKS, T_PLANKS, "b.planks"),
  leaves: blockItem("leaves", LEAVES, T_LEAVES, "b.leaves"),
  brick: blockItem("brick", BRICK, T_BRICK, "b.brick"),
  glass: blockItem("glass", GLASS, T_GLASS, "b.glass"),
  craft: blockItem("craft", CRAFT, T_CRAFT_SIDE, "b.craft"),
  stick: { id: "stick", nameKey: "i.stick", icon: T_STICK, kind: "material", maxStack: 64 },
  pickaxe: tool("pickaxe", "pickaxe", T_PICKAXE, "i.pickaxe"),
  axe: tool("axe", "axe", T_AXE, "i.axe"),
  sword: tool("sword", "sword", T_SWORD, "i.sword"),
};

/** Item id dropped when a block is mined (maps block id → item id). */
const BLOCK_DROP: Record<number, string> = {
  [GRASS]: "dirt", // grass turns to dirt when broken
  [STONE]: "cobble", // stone drops cobblestone
  [DIRT]: "dirt",
  [COBBLE]: "cobble",
  [SAND]: "sand",
  [LOG]: "log",
  [LEAVES]: "leaves",
  [PLANKS]: "planks",
  [BRICK]: "brick",
  [GLASS]: "glass",
  [CRAFT]: "craft",
};

/** Item id a mined block drops, or null if it drops nothing. */
export function dropFor(block: number): string | null {
  return BLOCK_DROP[block] ?? null;
}

export function itemDef(id: string): ItemDef | undefined {
  return ITEMS[id];
}

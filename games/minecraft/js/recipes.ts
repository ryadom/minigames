/* ==========================================================================
   Crafting recipes (shapeless).

   Each recipe lists its ingredients (item id + count) and the single item it
   produces. The crafting table UI (panels.ts) renders this list, greys out
   recipes you can't afford, and on craft removes the inputs and adds the
   output via the inventory.
   ========================================================================== */

import type { Inventory } from "./inventory";

export interface Ingredient {
  id: string;
  count: number;
}

export interface Recipe {
  id: string;
  out: Ingredient;
  in: Ingredient[];
}

export const RECIPES: Recipe[] = [
  { id: "planks", out: { id: "planks", count: 4 }, in: [{ id: "log", count: 1 }] },
  { id: "stick", out: { id: "stick", count: 4 }, in: [{ id: "planks", count: 2 }] },
  { id: "craft", out: { id: "craft", count: 1 }, in: [{ id: "planks", count: 4 }] },
  {
    id: "wood_pickaxe",
    out: { id: "pickaxe", count: 1 },
    in: [
      { id: "planks", count: 3 },
      { id: "stick", count: 2 },
    ],
  },
  {
    id: "wood_axe",
    out: { id: "axe", count: 1 },
    in: [
      { id: "planks", count: 3 },
      { id: "stick", count: 2 },
    ],
  },
  {
    id: "wood_sword",
    out: { id: "sword", count: 1 },
    in: [
      { id: "planks", count: 2 },
      { id: "stick", count: 1 },
    ],
  },
  {
    id: "stone_pickaxe",
    out: { id: "pickaxe", count: 1 },
    in: [
      { id: "cobble", count: 3 },
      { id: "stick", count: 2 },
    ],
  },
  {
    id: "stone_axe",
    out: { id: "axe", count: 1 },
    in: [
      { id: "cobble", count: 3 },
      { id: "stick", count: 2 },
    ],
  },
  {
    id: "stone_sword",
    out: { id: "sword", count: 1 },
    in: [
      { id: "cobble", count: 2 },
      { id: "stick", count: 1 },
    ],
  },
];

/** Does the inventory hold every ingredient for this recipe? */
export function canCraft(inv: Inventory, r: Recipe): boolean {
  return r.in.every((ing) => inv.countOf(ing.id) >= ing.count);
}

/** Consume ingredients and add the output. Returns false if unaffordable. */
export function craft(inv: Inventory, r: Recipe): boolean {
  if (!canCraft(inv, r)) return false;
  for (const ing of r.in) inv.remove(ing.id, ing.count);
  inv.add(r.out.id, r.out.count);
  return true;
}

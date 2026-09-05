import {
  ANIMALS as BASE_ANIMALS,
  BUILDS as BASE_BUILDS,
  CROPS as BASE_CROPS,
  DISHES as BASE_DISHES,
} from "../../farm/js/config";
import type { Animal, BuildDef, Crop, Dish } from "./types";

export * from "../../farm/js/config";

// A larger map and affordable construction put arranging the farm first.
export const GRID_COLS = 12;
export const GRID_ROWS = 12;
export const GRID_N = GRID_COLS * GRID_ROWS;
export const SOIL_BASE_COST = 10;
export const SOIL_STEP_COST = 2;
export const CROPS: Crop[] = BASE_CROPS.map((c) => ({ ...c, seed: c.id === "wheat" ? 0 : c.seed }));
export const CROP_BY_ID: Record<string, Crop> = Object.fromEntries(CROPS.map((c) => [c.id, c]));
export const ANIMALS: Animal[] = BASE_ANIMALS.map((a) => ({
  ...a,
  lvl: a.id === "chicken" ? 1 : a.lvl,
}));
export const ANIMAL_BY_ID: Record<string, Animal> = Object.fromEntries(
  ANIMALS.map((a) => [a.id, a]),
);
export const ANIMAL_FOR_PROD: Record<string, Animal> = Object.fromEntries(
  ANIMALS.map((a) => [a.prod, a]),
);
export const DISHES: Dish[] = BASE_DISHES.map((d) => ({ ...d, lvl: d.id === "bread" ? 1 : d.lvl }));
export const DISH_BY_ID: Record<string, Dish> = Object.fromEntries(DISHES.map((d) => [d.id, d]));
export const BUILDS: BuildDef[] = BASE_BUILDS.map((b) => ({
  ...b,
  lvl: b.id === "kitchen" || b.id === "pen-chicken" ? 1 : b.lvl,
}));
export const BUILD_BY_ID: Record<string, BuildDef> = Object.fromEntries(
  BUILDS.map((b) => [b.id, b]),
);

export function inBounds(i: number, w: number, h: number): boolean {
  return (
    Number.isInteger(i) &&
    Number.isInteger(w) &&
    Number.isInteger(h) &&
    i >= 0 &&
    i < GRID_N &&
    w > 0 &&
    h > 0 &&
    (i % GRID_COLS) + w <= GRID_COLS &&
    Math.floor(i / GRID_COLS) + h <= GRID_ROWS
  );
}
export function footprintCells(i: number, w: number, h: number): number[] {
  if (!inBounds(i, w, h)) return [];
  const cells: number[] = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) cells.push(i + row * GRID_COLS + col);
  }
  return cells;
}

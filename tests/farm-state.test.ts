/* Tests for Farm state: save / load / validation / migrations & grid helpers
   (games/farm/js/state.ts). */
import { beforeEach, describe, expect, test } from "bun:test";
import { GRID_COLS, GRID_N, MAX_SOIL } from "../games/farm/js/config";
import { setRuntime } from "../games/farm/js/runtime";
import {
  buildFits,
  clearBuild,
  countAnimals,
  ensurePen,
  load,
  need,
  reset,
  rootOf,
  save,
  stampBuild,
  state,
} from "../games/farm/js/state";
import type { Dom, HeaderUI, Tile } from "../games/farm/js/types";

// Level-ups during load reach for the header UI / toast; install stand-ins.
const ui: HeaderUI = {
  el: document.createElement("header"),
  setStat: () => {},
  stat: () => document.createElement("span"),
  action: () => null,
  refresh: () => {},
};
setRuntime(ui, { toast: document.createElement("div") } as unknown as Dom);

const SAVE_KEY = "mg.save.farm";
const writeSave = (v: number, data: unknown) =>
  localStorage.setItem(SAVE_KEY, JSON.stringify({ v, t: Date.now(), data }));

beforeEach(() => {
  localStorage.clear();
  reset();
});

describe("need", () => {
  test("XP-to-next-level curve", () => {
    expect(need(1)).toBe(60);
    expect(need(2)).toBe(110);
    expect(need(3)).toBe(160);
  });
});

describe("fresh farm", () => {
  test("reset() gives a starter farm", () => {
    expect(state.coins).toBe(30);
    expect(state.level).toBe(1);
    expect(state.cap).toBe(40);
    expect(state.quests).toHaveLength(3);
    // Starter grid has a market, an orders board and 6 soil tiles.
    const soil = state.grid.filter((t) => t?.kind === "soil");
    expect(soil).toHaveLength(6);
    expect(state.grid.some((t) => t?.kind === "market")).toBe(true);
    expect(state.grid.some((t) => t?.kind === "board")).toBe(true);
  });
});

describe("save / load round trip", () => {
  test("restores persisted progress into the live state", () => {
    reset();
    state.coins = 999;
    state.xp = 17;
    state.level = 4;
    state.inv = { wheat: 5 };
    save();
    // Scribble over the live state, then reload from disk.
    state.coins = 0;
    state.level = 1;
    load();
    expect(state.coins).toBe(999);
    expect(state.xp).toBe(17);
    expect(state.level).toBe(4);
    expect(state.inv.wheat).toBe(5);
  });
});

describe("load validation", () => {
  test("rejects out-of-range scalars, falling back to fresh defaults", () => {
    writeSave(7, { coins: -5, level: 0, cap: -1 });
    load();
    expect(state.coins).toBe(30); // negative coins ignored
    expect(state.level).toBe(1); // level < 1 ignored
    expect(state.cap).toBe(40); // non-positive cap ignored
  });

  test("keeps only real items (with positive counts) in the inventory", () => {
    writeSave(7, { inv: { wheat: 3, bogus: 5, carrot: -1, tomato: 2 } });
    load();
    expect(state.inv).toEqual({ wheat: 3, tomato: 2 });
  });

  test("clamps upgrade levels to their maximum", () => {
    writeSave(7, { soil: 999 });
    load();
    expect(state.soil).toBe(MAX_SOIL);
  });

  test("drops animals of unknown type", () => {
    writeSave(7, {
      animals: [
        { type: "chicken", grown: 0, feedUntil: 0 },
        { type: "dragon", grown: 0, feedUntil: 0 },
      ],
    });
    load();
    expect(state.animals).toHaveLength(1);
    expect(state.animals[0].type).toBe("chicken");
  });
});

describe("migrations drop incompatible saves", () => {
  test("a pre-grid (v5) save is discarded, leaving a fresh farm", () => {
    writeSave(5, { coins: 5000, level: 20 });
    load();
    expect(state.coins).toBe(30);
    expect(state.level).toBe(1);
  });
});

describe("offline progress", () => {
  test("crops keep growing while away (capped at full growth)", () => {
    reset();
    // Plant wheat on the first soil tile and pretend it was just planted.
    const idx = state.grid.findIndex((t) => t?.kind === "soil");
    (state.grid[idx] as Tile).crop = "wheat";
    (state.grid[idx] as Tile).grown = 0;
    state.inv = {};
    save();
    // Backdate lastSeen so load() credits offline growth.
    const env = JSON.parse(localStorage.getItem(SAVE_KEY) as string);
    env.data.lastSeen = Date.now() - 10_000;
    localStorage.setItem(SAVE_KEY, JSON.stringify(env));
    load();
    const tile = state.grid[idx] as Tile;
    expect(tile.grown).toBeGreaterThan(0);
  });
});

describe("grid footprint helpers", () => {
  test("buildFits respects bounds and occupancy", () => {
    const grid: (Tile | null)[] = new Array(GRID_N).fill(null);
    expect(buildFits(grid, 0, 2, 2)).toBe(true);
    grid[GRID_COLS + 1] = { kind: "soil" }; // block a cell of the 2×2 footprint
    expect(buildFits(grid, 0, 2, 2)).toBe(false);
    expect(buildFits(grid, GRID_COLS - 1, 2, 1)).toBe(false); // off the edge
  });

  test("stampBuild lays a root tile plus link cells; rootOf resolves them", () => {
    const grid: (Tile | null)[] = new Array(GRID_N).fill(null);
    stampBuild(grid, 0, { kind: "kitchen", w: 2, h: 2 });
    expect(grid[0]?.kind).toBe("kitchen");
    expect(grid[1]?.kind).toBe("link");
    expect(grid[GRID_COLS]?.kind).toBe("link");
    expect((grid[GRID_COLS + 1] as Tile).root).toBe(0);
  });

  test("rootOf / clearBuild operate on the whole footprint", () => {
    // Stamp into a known-empty corner of the live grid.
    const root = (GRID_N - GRID_COLS * 2) | 0; // somewhere near the bottom-left
    state.grid[root] = null;
    stampBuild(state.grid, root, { kind: "kitchen", w: 2, h: 2 });
    expect(rootOf(root + 1)).toBe(root);
    clearBuild(root + 1);
    expect(state.grid[root]).toBeNull();
    expect(state.grid[root + 1]).toBeNull();
    expect(state.grid[root + GRID_COLS]).toBeNull();
  });
});

describe("pens & animals", () => {
  test("ensurePen creates a default pen record", () => {
    delete state.pens.chicken;
    const pen = ensurePen("chicken");
    expect(pen).toEqual({ feeder: false, collector: false, feed: 0 });
    expect(state.pens.chicken).toBe(pen);
  });

  test("countAnimals counts living animals of a type", () => {
    state.animals = [
      { type: "chicken", grown: 0, feedUntil: 0 },
      { type: "chicken", grown: 0, feedUntil: 0 },
      { type: "cow", grown: 0, feedUntil: 0 },
    ];
    expect(countAnimals("chicken")).toBe(2);
    expect(countAnimals("cow")).toBe(1);
    expect(countAnimals("pig")).toBe(0);
  });
});

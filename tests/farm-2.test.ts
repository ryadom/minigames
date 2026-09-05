import { beforeEach, describe, expect, test } from "bun:test";
import { actPlot, freshAgg, handle } from "../games/farm-2/js/actions";
import {
  ANIMAL_BY_ID,
  CROP_BY_ID,
  DISH_BY_ID,
  GRID_COLS,
  GRID_N,
  inBounds,
} from "../games/farm-2/js/config";
import { soilTileCost } from "../games/farm-2/js/economy";
import { initInput } from "../games/farm-2/js/input";
import { setRuntime } from "../games/farm-2/js/runtime";
import {
  buildFits,
  canMoveBuild,
  canRemoveBuild,
  load,
  migratePrototype,
  moveBuild,
  reset,
  rootOf,
  save,
  stampBuild,
  state,
} from "../games/farm-2/js/state";
import type { Dom, HeaderUI } from "../games/farm-2/js/types";

const at = (col: number, row: number) => row * GRID_COLS + col;
const kitchen = at(8, 8);
const chicken = at(8, 4);
const ui: HeaderUI = {
  el: document.createElement("header"),
  setStat: () => {},
  stat: () => null,
  action: () => null,
  refresh: () => {},
};

beforeEach(() => {
  localStorage.clear();
  const dom = Object.fromEntries(
    ["worldView", "world", "toolbar", "overlay", "toast", "panHint", "lvl", "xpfill", "store"].map(
      (id) => {
        const element = document.createElement("div");
        element.id = id;
        return [id, element];
      },
    ),
  ) as unknown as Dom;
  setRuntime(ui, dom);
  initInput();
  reset();
});

describe("Farm 2 construction", () => {
  test("starts with cooking, chickens and a 12 by 12 buildable map", () => {
    expect(state.grid).toHaveLength(144);
    expect(state.grid[kitchen]?.kind).toBe("kitchen");
    expect(state.animals[0].type).toBe("chicken");
    expect(DISH_BY_ID.bread.lvl).toBe(1);
    expect(ANIMAL_BY_ID.chicken.lvl).toBe(1);
    expect("energy" in state).toBe(false);
    expect("day" in state).toBe(false);
  });
  test("a preview spends nothing; confirmation reserves the whole footprint", () => {
    state.level = 5;
    handle("game-mode", "build");
    handle("buildsel", "greenhouse");
    const dest = at(0, 8);
    const before = state.coins;
    handle("buildcell", String(dest));
    expect(state.placeAt).toBe(dest);
    expect(state.coins).toBe(before);
    expect(state.grid[dest]).toBeNull();
    handle("placeok");
    expect(state.coins).toBe(before - 240);
    expect(state.grid[dest]).toMatchObject({ kind: "greenhouse", w: 3, h: 3 });
    expect(state.grid[dest + 2 + 2 * GRID_COLS]).toEqual({ kind: "link", root: dest });
    expect(state.placeAt).toBeNull();
  });
  test("cancelled, colliding, locked and unaffordable builds don't change the map", () => {
    handle("game-mode", "build");
    const before = JSON.stringify(state.grid);
    const coins = state.coins;
    handle("buildsel", "soil");
    handle("buildcell", String(at(0, 8)));
    handle("placecancel");
    handle("buildcell", String(kitchen));
    handle("placeok");
    handle("buildsel", "greenhouse");
    handle("buildcell", String(at(0, 8)));
    handle("placeok");
    expect(JSON.stringify(state.grid)).toBe(before);
    expect(state.coins).toBe(coins);
    state.coins = 0;
    handle("buildsel", "soil");
    handle("buildcell", String(at(0, 8)));
    handle("placeok");
    expect(state.coins).toBe(0);
    expect(JSON.stringify(state.grid)).toBe(before);
  });
  test("new soil can be planted immediately and existing unique buildings cannot be duplicated", () => {
    const dest = at(1, 7);
    const cost = soilTileCost();
    const coins = state.coins;
    handle("game-mode", "build");
    handle("buildsel", "soil");
    handle("buildcell", String(dest));
    handle("placeok");
    expect(state.coins).toBe(coins - cost);
    expect(actPlot(dest, freshAgg())).toBe(true);
    expect(state.grid[dest]?.crop).toBe("wheat");
    const before = state.coins;
    handle("buildsel", "kitchen");
    handle("buildcell", String(at(0, 9)));
    handle("placeok");
    expect(state.coins).toBe(before);
    expect(state.grid.filter((t) => t?.kind === "kitchen")).toHaveLength(1);
  });
});

describe("Farm 2 moving", () => {
  test("moves soil with its exact crop, watering, fertilizer and growth", () => {
    const src = at(2, 4);
    const tile = state.grid[src];
    if (!tile) throw new Error("missing soil");
    tile.grown = 4200;
    tile.water = 3500;
    tile.fert = true;
    const original = { ...tile };
    expect(moveBuild(src, at(1, 8))).toBe(true);
    expect(state.grid[src]).toBeNull();
    expect(state.grid[at(1, 8)]).toBe(tile);
    expect(tile).toEqual(original);
  });
  test("moves a multi-cell building over its own footprint without orphaning links", () => {
    expect(moveBuild(kitchen, kitchen + 1)).toBe(true);
    expect(state.grid[kitchen]).toBeNull();
    expect(state.grid[kitchen + GRID_COLS]).toBeNull();
    expect(state.grid[kitchen + 1]?.kind).toBe("kitchen");
    for (const offset of [2, GRID_COLS + 1, GRID_COLS + 2]) {
      expect(state.grid[kitchen + offset]).toEqual({ kind: "link", root: kitchen + 1 });
    }
  });
  test("out-of-bounds and occupied moves leave both locations untouched", () => {
    const before = structuredClone(state.grid);
    for (const dest of [-1, 1.5, GRID_N, at(11, 8), at(8, 11), at(2, 4), chicken]) {
      expect(canMoveBuild(kitchen, dest)).toBe(false);
      expect(moveBuild(kitchen, dest)).toBe(false);
      expect(state.grid).toEqual(before);
    }
    expect(moveBuild(-1, at(0, 8))).toBe(false);
    expect(inBounds(-1, 2, 2)).toBe(false);
  });
  test("two-tap Move works for a building link cell and cancels when tapped again", () => {
    handle("game-mode", "move");
    handle("buildcell", String(kitchen + 1));
    expect(state.moveSrc).toBe(kitchen);
    handle("buildcell", String(kitchen));
    expect(state.moveSrc).toBeNull();
    handle("buildcell", String(kitchen + 1));
    handle("buildcell", String(at(0, 8)));
    expect(state.grid[at(0, 8)]?.kind).toBe("kitchen");
    expect(state.moveSrc).toBeNull();
    expect(rootOf(at(1, 9))).toBe(at(0, 8));
  });
  test("a moved pen retains animals, production timers and its stocked automation", () => {
    state.animals[0].grown = 7000;
    state.pens.chicken = { feeder: true, collector: true, feed: 8 };
    const animals = structuredClone(state.animals);
    const pens = structuredClone(state.pens);
    expect(moveBuild(chicken, at(0, 8))).toBe(true);
    expect(state.animals).toEqual(animals);
    expect(state.pens).toEqual(pens);
  });
  test("removal refuses occupied plots, animals and active cooking", () => {
    expect(canRemoveBuild(at(2, 4))).toBe(false);
    expect(canRemoveBuild(chicken)).toBe(false);
    handle("cook", "bread");
    expect(canRemoveBuild(kitchen)).toBe(false);
    handle("game-mode", "build");
    handle("buildsel", "remove");
    handle("buildcell", String(kitchen));
    expect(state.grid[kitchen]?.kind).toBe("kitchen");
    expect(canRemoveBuild(at(4, 4))).toBe(true);
  });
});

describe("Farm 2 production and economy", () => {
  test("cooking spends ingredients, survives a kitchen move, and collects only once", () => {
    const wheat = state.inv.wheat;
    handle("cook", "bread");
    expect(state.inv.wheat).toBe(wheat - 2);
    const cook = state.cooks[0];
    if (!cook) throw new Error("missing cooking job");
    expect(cook.endsAt).toBeGreaterThan(Date.now());
    expect(moveBuild(kitchen, at(0, 8))).toBe(true);
    expect(state.cooks[0]).toBe(cook);
    handle("collectcook", "0");
    expect(state.inv.bread || 0).toBe(0);
    cook.endsAt = Date.now() - 1;
    handle("collectcook", "0");
    handle("collectcook", "0");
    expect(state.inv.bread).toBe(1);
    expect(state.cooks[0]).toBeNull();
  });
  test("missing ingredients and occupied stoves do not charge again", () => {
    state.inv = {};
    handle("cook", "bread");
    expect(state.cooks[0]).toBeNull();
    state.inv.wheat = 4;
    handle("cook", "bread");
    handle("cook", "bread");
    expect(state.inv.wheat).toBe(2);
  });
  test("hungry animals consume feed and ready produce can be collected once", () => {
    state.animals[0].feedUntil = 0;
    handle("feedall", "chicken");
    expect(state.inv.wheat).toBe(5);
    expect(state.animals[0].feedUntil).toBeGreaterThan(Date.now());
    state.animals[0].grown = ANIMAL_BY_ID.chicken.interval;
    state.penType = "chicken";
    handle("collectall", "pen");
    handle("collectall", "pen");
    expect(state.inv.egg).toBe(1);
    expect(state.animals[0].grown).toBe(0);
  });
  test("harvest respects barn capacity and free wheat lets a broke farm keep growing", () => {
    state.coins = 0;
    state.sel = "wheat";
    expect(actPlot(at(4, 4), freshAgg())).toBe(true);
    expect(state.coins).toBe(0);
    state.inv = { wheat: state.cap };
    expect(actPlot(at(2, 4), freshAgg())).toBe(false);
    expect(state.grid[at(2, 4)]?.crop).toBe("wheat");
  });
  test("greenhouse pots and hives keep their production when their buildings move", () => {
    stampBuild(state.grid, at(0, 8), { kind: "greenhouse", w: 3, h: 3 });
    stampBuild(state.grid, at(6, 10), { kind: "apiary", w: 2, h: 2 });
    state.pots[0] = { flower: "tulip", endsAt: Date.now() + 5000, total: 60000 };
    state.hives = [{ grown: 5000 }];
    const pots = structuredClone(state.pots);
    expect(moveBuild(at(0, 8), at(0, 9))).toBe(true);
    expect(moveBuild(at(6, 10), at(10, 9))).toBe(true);
    expect(state.pots).toEqual(pots);
    expect(state.hives).toEqual([{ grown: 5000 }]);
  });
});

describe("Farm 2 persistence", () => {
  test("saving and reloading retains relocated footprints and production", () => {
    handle("cook", "bread");
    moveBuild(kitchen, at(0, 8));
    const endsAt = state.cooks[0]?.endsAt;
    save();
    load();
    expect(state.grid[kitchen]).toBeNull();
    expect(state.grid[at(0, 8)]?.kind).toBe("kitchen");
    expect(rootOf(at(1, 9))).toBe(at(0, 8));
    expect(state.cooks[0]?.endsAt).toBe(endsAt);
    expect(state.build).toBe(false);
  });
  test("prototype migration preserves crops, coins and stock in a buildable farm", () => {
    const migrated = migratePrototype({
      coins: 99,
      inventory: { carrot: 7, bogus: 99 },
      hens: 2,
      plots: [
        { crop: "carrot", growth: 1 },
        { crop: "wheat", growth: 2 },
      ],
    });
    expect(migrated?.coins).toBe(99);
    expect(migrated?.inv).toEqual({ carrot: 7 });
    expect(migrated?.animals).toHaveLength(2);
    expect(migrated?.grid[at(2, 4)]).toMatchObject({
      crop: "carrot",
      grown: CROP_BY_ID.carrot.grow / 2,
    });
    expect(migrated?.grid[at(3, 4)]).toMatchObject({ crop: "wheat", grown: CROP_BY_ID.wheat.grow });
    expect(migrated?.grid[kitchen]?.kind).toBe("kitchen");
    expect(migrated).not.toHaveProperty("energy");
  });
  test("the save store upgrades prototype saves without overwriting original Farm", () => {
    localStorage.setItem("mg.save.farm", "original");
    localStorage.setItem(
      "mg.save.farm-2",
      JSON.stringify({ v: 1, data: { coins: 51, inventory: { wheat: 3 }, plots: [] } }),
    );
    load();
    expect(state.coins).toBe(51);
    expect(state.inv.wheat).toBe(3);
    save();
    expect(JSON.parse(localStorage.getItem("mg.save.farm-2") || "{}").v).toBe(2);
    expect(localStorage.getItem("mg.save.farm")).toBe("original");
    expect(buildFits(state.grid, -1, 2, 2)).toBe(false);
  });
});

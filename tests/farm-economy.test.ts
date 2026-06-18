/* Tests for the Farm economy & progression rules (games/farm/js/economy.ts). */
import { beforeEach, describe, expect, test } from "bun:test";
import { ITEM } from "../games/farm/js/config";
import {
  addItem,
  addXp,
  collectorCost,
  deliverablePool,
  feederCost,
  flowerMul,
  hasRecipe,
  held,
  invCount,
  isUnlocked,
  itemUnlocked,
  makeQuest,
  potCost,
  price,
  rollMarket,
  soilMul,
  soilTileCost,
  spaceLeft,
  sprinkleEvery,
  takeItem,
  tradeCost,
  tradeMul,
  unlocksAt,
} from "../games/farm/js/economy";
import { setRuntime } from "../games/farm/js/runtime";
import { reset, state } from "../games/farm/js/state";
import type { Dom, HeaderUI } from "../games/farm/js/types";

// addXp / level-up toasts reach for the header UI and the toast element; the
// game installs these at boot. Provide lightweight stand-ins so the economy
// logic can run headless.
const levelStat = document.createElement("span");
const ui: HeaderUI = {
  el: document.createElement("header"),
  setStat: () => {},
  stat: () => levelStat,
  action: () => null,
  refresh: () => {},
};
const dom = { toast: document.createElement("div") } as unknown as Dom;
setRuntime(ui, dom);

beforeEach(() => {
  localStorage.clear();
  reset(); // fresh farm: level 1, 30 coins, 6 starter soil tiles, empty inventory
});

describe("upgrade multipliers", () => {
  test("scale with the relevant upgrade level", () => {
    state.soil = 2;
    state.oven = 3;
    state.heater = 1;
    state.trade = 5;
    expect(soilMul()).toBeCloseTo(1.16);
    expect(flowerMul()).toBeCloseTo(1.1);
    expect(tradeMul()).toBeCloseTo(1.3);
  });

  test("sprinkler cadence speeds up with level and clamps at 7s", () => {
    state.sprinkler = 1;
    expect(sprinkleEvery()).toBe(30000);
    state.sprinkler = 2;
    expect(sprinkleEvery()).toBe(24000);
    state.sprinkler = 6;
    expect(sprinkleEvery()).toBe(7000); // clamped
  });
});

describe("inventory helpers", () => {
  test("add / take / held / count / space", () => {
    state.inv = {};
    state.cap = 40;
    addItem("wheat", 5);
    addItem("carrot", 3);
    expect(held("wheat")).toBe(5);
    expect(invCount()).toBe(8);
    expect(spaceLeft()).toBe(32);
    takeItem("wheat", 2);
    expect(held("wheat")).toBe(3);
    takeItem("carrot", 99); // taking more than held removes the entry
    expect(held("carrot")).toBe(0);
    expect(state.inv.carrot).toBeUndefined();
  });

  test("hasRecipe checks the inventory against a recipe", () => {
    state.inv = { wheat: 2, milk: 1 };
    expect(hasRecipe({ wheat: 2, milk: 1 })).toBe(true);
    expect(hasRecipe({ wheat: 3 })).toBe(false);
  });
});

describe("unlocks", () => {
  test("isUnlocked gates on level", () => {
    state.level = 3;
    expect(isUnlocked(3)).toBe(true);
    expect(isUnlocked(4)).toBe(false);
  });

  test("itemUnlocked respects each item's level requirement", () => {
    state.level = 1;
    expect(itemUnlocked("wheat")).toBe(true); // lvl 1 crop
    expect(itemUnlocked("potato")).toBe(false); // lvl 2 crop
    expect(itemUnlocked("honey")).toBe(false); // apiary @ lvl 5
    state.level = 5;
    expect(itemUnlocked("potato")).toBe(true);
    expect(itemUnlocked("honey")).toBe(true);
  });
});

describe("market pricing", () => {
  test("price = base × market multiplier × trade multiplier, floored at 1", () => {
    state.trade = 0;
    state.prices = { wheat: 1 };
    expect(price("wheat")).toBe(ITEM.wheat.sell); // 5
    state.prices = { wheat: 2 };
    expect(price("wheat")).toBe(10);
    state.prices = { wheat: 0.05 };
    expect(price("wheat")).toBe(1); // never below 1
  });

  test("the trade upgrade lifts every price", () => {
    state.prices = { wheat: 1 };
    state.trade = 5; // ×1.30
    expect(price("wheat")).toBe(Math.round(5 * 1.3));
  });

  test("rollMarket(force) re-rolls all prices into 0.75–1.35 and sets a window", () => {
    const before = Date.now();
    rollMarket(state, true);
    for (const id in ITEM) {
      expect(state.prices[id]).toBeGreaterThanOrEqual(0.75);
      expect(state.prices[id]).toBeLessThanOrEqual(1.35);
    }
    expect(state.marketUntil).toBeGreaterThan(before);
  });

  test("rollMarket without force keeps prices until the window expires", () => {
    rollMarket(state, true);
    const snapshot = { ...state.prices };
    rollMarket(state, false); // window still open → no change
    expect(state.prices).toEqual(snapshot);
  });
});

describe("XP & levelling", () => {
  test("addXp accrues without levelling below the threshold", () => {
    state.level = 1;
    state.xp = 0;
    addXp(10);
    expect(state.level).toBe(1);
    expect(state.xp).toBe(10);
  });

  test("crossing the threshold levels up and grants a coin bonus", () => {
    state.level = 1;
    state.xp = 0;
    state.coins = 0;
    addXp(60); // need(1) = 60
    expect(state.level).toBe(2);
    expect(state.xp).toBe(0);
    expect(state.coins).toBe(2 * 12); // bonus = level × 12
  });

  test("a big XP grant can level up multiple times", () => {
    state.level = 1;
    state.xp = 0;
    addXp(60 + 110); // need(1)=60, need(2)=110
    expect(state.level).toBe(3);
  });

  test("unlocksAt reports the icons unlocked at a level", () => {
    expect(unlocksAt(5)).toContain("🐝"); // apiary unlocks at level 5
    expect(unlocksAt(2)).toContain("🥔"); // potato (lvl 2)
  });
});

describe("orders / quests", () => {
  test("deliverablePool only lists unlocked items", () => {
    state.level = 1;
    const pool = deliverablePool(state);
    expect(pool).toContain("wheat");
    expect(pool).not.toContain("potato");
  });

  test("makeQuest produces a sane order for a known item", () => {
    const q = makeQuest(state);
    expect(ITEM[q.item]).toBeDefined();
    expect(q.need).toBeGreaterThanOrEqual(1);
    expect(q.coins).toBeGreaterThan(0);
    expect(q.xp).toBeGreaterThanOrEqual(3);
  });
});

describe("cost curves", () => {
  test("feeder / collector scale off the animal's cost", () => {
    expect(feederCost("chicken")).toBe(Math.round(45 * 1.4));
    expect(collectorCost("chicken")).toBe(Math.round(45 * 1.8));
  });

  test("soil tile cost rises with how many soil tiles are placed", () => {
    // A fresh farm starts with 6 soil tiles.
    expect(soilTileCost()).toBe(30 + 6 * 18);
  });

  test("upgrade costs grow with the current level", () => {
    state.potCap = 2;
    expect(potCost()).toBe(70);
    state.potCap = 3;
    expect(potCost()).toBe(70 + 90);
    state.trade = 0;
    expect(tradeCost()).toBe(160);
    state.trade = 2;
    expect(tradeCost()).toBe(160 + 2 * 180);
  });
});

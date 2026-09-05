import { describe, expect, test } from "bun:test";
import {
  CROPS,
  claimMilestone,
  createFarm,
  deliver,
  endDay,
  level,
  maxEnergy,
  milestoneProgress,
  price,
  ready,
  restoreFarm,
  season,
  seasonDay,
  sell,
  upgrade,
  workPlot,
} from "../games/farm-2/js/model";

describe("Meadow Days crop cycle", () => {
  test("a planted crop grows only on watered nights, then harvests once", () => {
    const farm = createFarm();
    expect(workPlot(farm, 2, "plant", "carrot").ok).toBe(true);
    expect(farm.coins).toBe(76);
    expect(farm.energy).toBe(23);
    endDay(farm);
    expect(farm.plots[2].growth).toBe(0);
    expect(farm.energy).toBe(24);
    expect(workPlot(farm, 2, "water", "wheat").ok).toBe(true);
    endDay(farm);
    expect(farm.plots[2].growth).toBe(1);
    expect(farm.plots[2].watered).toBe(false);
    workPlot(farm, 2, "water", "wheat");
    endDay(farm);
    expect(ready(farm.plots[2])).toBe(true);
    const before = farm.energy;
    expect(workPlot(farm, 2, "harvest", "wheat").ok).toBe(true);
    expect(farm.inventory.carrot).toBe(2);
    expect(farm.xp).toBe(CROPS.carrot.xp);
    expect(farm.energy).toBe(before - 1);
    expect(farm.plots[2].crop).toBeNull();
    expect(workPlot(farm, 2, "harvest", "wheat").ok).toBe(false);
    expect(farm.inventory.carrot).toBe(2);
  });
  test("rain waters newly planted crops without spending watering energy", () => {
    const farm = createFarm();
    farm.day = 6; // A deterministic rainy day.
    expect(workPlot(farm, 2, "plant", "wheat").ok).toBe(true);
    expect(farm.plots[2].watered).toBe(true);
    const energy = farm.energy;
    expect(workPlot(farm, 2, "water", "wheat").ok).toBe(false);
    expect(farm.energy).toBe(energy);
    endDay(farm);
    expect(farm.plots[2].growth).toBe(1);
  });
  test("invalid, unaffordable, locked and exhausted actions leave the farm unchanged", () => {
    const farm = createFarm();
    for (const [index, tool, crop] of [
      [-1, "plant", "wheat"],
      [12, "plant", "wheat"],
      [2.5, "plant", "wheat"],
      [0, "plant", "carrot"],
      [2, "plant", "pumpkin"],
      [2, "harvest", "wheat"],
    ] as const) {
      const before = structuredClone(farm);
      expect(workPlot(farm, index, tool, crop).ok).toBe(false);
      expect(farm).toEqual(before);
    }
    farm.coins = 0;
    const before = structuredClone(farm);
    expect(workPlot(farm, 2, "plant", "carrot").ok).toBe(false);
    expect(farm).toEqual(before);
    expect(workPlot(farm, 2, "plant", "wheat").ok).toBe(true);
    farm.energy = 0;
    const tired = structuredClone(farm);
    expect(workPlot(farm, 0, "harvest", "wheat").ok).toBe(false);
    expect(workPlot(farm, 2, "water", "wheat").ok).toBe(false);
    expect(farm).toEqual(tired);
  });
  test("ripe crops stay available through many days and seasons", () => {
    const farm = createFarm();
    for (let i = 0; i < 40; i++) endDay(farm);
    expect(ready(farm.plots[0])).toBe(true);
    expect(workPlot(farm, 0, "harvest", "wheat").ok).toBe(true);
  });
});

describe("Meadow Days economy and progression", () => {
  test("orders consume the requested stock, award coins and XP, and replace the order", () => {
    const farm = createFarm();
    const order = farm.orders[0];
    const before = structuredClone(farm);
    expect(deliver(farm, 0).ok).toBe(false);
    expect(farm).toEqual(before);
    farm.inventory[order.item] = order.quantity;
    expect(deliver(farm, 0).ok).toBe(true);
    expect(farm.inventory[order.item]).toBe(0);
    expect(farm.coins).toBe(80 + order.coins);
    expect(farm.xp).toBe(order.xp);
    expect(farm.delivered).toBe(1);
    expect(farm.orders[0]).not.toBe(order);
    expect(farm.orders).toHaveLength(3);
  });
  test("season boundaries and sale bonuses repeat each year", () => {
    expect([1, 8, 9, 17, 25, 33].map(season)).toEqual([0, 0, 1, 2, 3, 0]);
    expect([1, 8, 9, 33].map(seasonDay)).toEqual([1, 8, 1, 1]);
    const farm = createFarm();
    expect(price(farm, "carrot")).toBe(10);
    farm.inventory.carrot = 2;
    expect(sell(farm, "carrot", -1).ok).toBe(false);
    expect(sell(farm, "carrot", 1.5).ok).toBe(false);
    expect(sell(farm, "carrot", 3).ok).toBe(false);
    expect(sell(farm, "carrot", 2).ok).toBe(true);
    expect(farm.coins).toBe(100);
    farm.day = 9;
    expect(price(farm, "carrot")).toBe(8);
  });
  test("upgrades charge once, respect caps, and increase actual usable capacity", () => {
    const farm = createFarm();
    farm.coins = 10_000;
    expect(upgrade(farm, "coop").ok).toBe(false);
    farm.xp = 20;
    expect(level(farm)).toBe(2);
    const coins = farm.coins;
    expect(upgrade(farm, "land").ok).toBe(true);
    expect(farm.coins).toBe(coins - 90);
    expect(farm.plots).toHaveLength(16);
    expect(workPlot(farm, 15, "plant", "potato").ok).toBe(true);
    upgrade(farm, "land");
    upgrade(farm, "land");
    expect(upgrade(farm, "land").ok).toBe(false);
    expect(farm.plots).toHaveLength(24);
    upgrade(farm, "well");
    upgrade(farm, "well");
    expect(maxEnergy(farm)).toBe(40);
    expect(upgrade(farm, "well").ok).toBe(false);
    endDay(farm);
    expect(farm.energy).toBe(40);
  });
  test("hens produce only with enough feed, with no negative inventory", () => {
    const farm = createFarm();
    farm.coins = 1000;
    farm.xp = 20;
    upgrade(farm, "coop");
    upgrade(farm, "coop");
    farm.inventory.wheat = 1;
    expect(endDay(farm)).toMatchObject({ eggs: 2, hungry: 1 });
    expect(farm.inventory.wheat).toBe(0);
    expect(farm.inventory.egg).toBe(2);
    expect(endDay(farm)).toMatchObject({ eggs: 0, hungry: 2 });
    expect(farm.inventory.egg).toBe(2);
  });
  test("journal rewards must be earned and cannot be collected twice", () => {
    const farm = createFarm();
    expect(claimMilestone(farm).ok).toBe(false);
    farm.harvested = 6;
    expect(milestoneProgress(farm)).toBe(6);
    expect(claimMilestone(farm).ok).toBe(true);
    expect(farm.coins).toBe(120);
    expect(claimMilestone(farm).ok).toBe(false);
    expect(farm.coins).toBe(120);
  });
});

describe("Meadow Days persistence", () => {
  test("valid save round-trips preserve a developed farm without advancing time", () => {
    const farm = createFarm();
    farm.coins = 1500;
    farm.xp = 70;
    upgrade(farm, "land");
    upgrade(farm, "coop");
    upgrade(farm, "well");
    workPlot(farm, 14, "plant", "tomato");
    workPlot(farm, 14, "water", "tomato");
    endDay(farm);
    expect(restoreFarm(JSON.parse(JSON.stringify(farm)))).toEqual(farm);
  });
  test("missing or malformed saves recover a playable farm", () => {
    expect(restoreFarm(null)).toEqual(createFarm());
    const farm = restoreFarm({
      day: -1,
      coins: NaN,
      xp: Infinity,
      hens: 900,
      energy: -100,
      plots: Array.from({ length: 12 }, () => ({ crop: "unknown", growth: -1 })),
      inventory: { wheat: -12, carrot: "500" },
      orders: [null, { item: "egg" }, { item: "pumpkin" }],
    });
    expect(farm.day).toBe(1);
    expect(farm.coins).toBe(80);
    expect(farm.hens).toBe(0);
    expect(farm.energy).toBe(24);
    expect(farm.inventory.wheat).toBe(0);
    expect(farm.inventory.carrot).toBe(0);
    expect(farm.plots.every((plot) => plot.crop === null)).toBe(true);
    expect(farm.orders.every((order) => order.item === "wheat" || order.item === "carrot")).toBe(
      true,
    );
    expect(workPlot(farm, 0, "plant", "wheat").ok).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import { project, unproject } from "../games/farm-2/js/art";
import { ANIMALS, BUILDINGS, CROPS, GOALS, type Kind, RECIPES } from "../games/farm-2/js/data";
import {
  advance,
  apply,
  dimensions,
  type Entity,
  entityAt,
  type Farm,
  fits,
  land,
  level,
  newFarm,
  progress,
  restore,
} from "../games/farm-2/js/model";

const NOW = 1_000_000;
function empty(): Farm {
  const s = newFarm(NOW);
  s.entities = [];
  return s;
}
function add(s: Farm, kind: Kind, x = 3, y = 3): Entity {
  const result = apply(s, { type: "build", kind, x, y });
  if (!result.ok) throw new Error(result.error);
  const e = s.entities.find((e) => e.id === result.id);
  if (!e) throw new Error("Building was not created");
  return e;
}
function unchanged(s: Farm, action: Parameters<typeof apply>[1]): void {
  const before = structuredClone(s);
  expect(apply(s, action).ok).toBe(false);
  expect(s).toEqual(before);
}

describe("Quiet Valley: construction and layout", () => {
  test("a complete starter farm has no overlaps, energy or day counter", () => {
    const s = newFarm(NOW);
    for (const e of s.entities) expect(fits(s, e.kind, e.x, e.y, e.rotated, e.id)).toBe(true);
    expect(s.entities.filter((e) => e.kind === "plot")).toHaveLength(9);
    expect(s.entities.flatMap((e) => e.animals)).toHaveLength(2);
    expect("energy" in s).toBe(false);
    expect("day" in s).toBe(false);
  });
  test("isometric projection round-trips every tile center", () => {
    for (let x = 0; x < 12; x++)
      for (let y = 0; y < 12; y++) {
        const p = unproject(...project(x + 0.5, y + 0.5));
        expect(p[0]).toBeCloseTo(x + 0.5);
        expect(p[1]).toBeCloseTo(y + 0.5);
      }
  });
  test("the river and clipped corners are not buildable", () => {
    expect(land(0, 0)).toBe(false);
    expect(land(11, 11)).toBe(false);
    expect(land(2, 0)).toBe(true);
    for (const x of [-1, 12, 0.5, Infinity, NaN]) expect(land(x, 4)).toBe(false);
  });
  test("preview is free and confirmation creates a whole footprint", () => {
    const s = empty(),
      coins = s.coins;
    expect(fits(s, "barn", 3, 3)).toBe(true);
    expect(s.coins).toBe(coins);
    expect(s.entities).toHaveLength(0);
    const e = add(s, "barn");
    expect(s.coins).toBe(coins - BUILDINGS.barn.cost);
    for (let x = 3; x < 5; x++) for (let y = 3; y < 6; y++) expect(entityAt(s, x, y)).toBe(e);
  });
  test("invalid, overlapping and unaffordable builds are atomic", () => {
    const s = empty();
    add(s, "barn");
    unchanged(s, { type: "build", kind: "kitchen", x: 4, y: 5 });
    unchanged(s, { type: "build", kind: "barn", x: 11, y: 2 });
    s.coins = 0;
    unchanged(s, { type: "build", kind: "plot", x: 8, y: 8 });
  });
  test("multiple workshops can be constructed independently", () => {
    const s = empty(),
      first = add(s, "kitchen"),
      second = add(s, "kitchen", 7, 6);
    expect(first.id).not.toBe(second.id);
    expect(s.entities).toHaveLength(2);
  });
  test("moving an active bed preserves its crop and watering", () => {
    const s = empty(),
      e = add(s, "plot");
    apply(s, { type: "plant", id: e.id, crop: "carrot" });
    apply(s, { type: "water", id: e.id });
    advance(s, NOW + 12_000);
    const growth = e.growth,
      coins = s.coins;
    expect(apply(s, { type: "move", id: e.id, x: 8, y: 7 }).ok).toBe(true);
    expect(e.crop).toBe("carrot");
    expect(e.watered).toBe(true);
    expect(e.growth).toBe(growth);
    expect(s.coins).toBe(coins);
    expect(entityAt(s, 3, 3)).toBeUndefined();
    expect(entityAt(s, 8, 7)).toBe(e);
  });
  test("an overlapping relocation ignores only its own footprint", () => {
    const s = empty(),
      e = add(s, "barn");
    expect(apply(s, { type: "move", id: e.id, x: 4, y: 3 }).ok).toBe(true);
    expect(entityAt(s, 3, 3)).toBeUndefined();
    expect(entityAt(s, 5, 5)).toBe(e);
    add(s, "plot", 6, 4);
    unchanged(s, { type: "move", id: e.id, x: 5, y: 3 });
  });
  test("rotation changes placement dimensions and cannot collide", () => {
    const s = empty(),
      e = add(s, "barn");
    expect(dimensions("barn", true)).toEqual([3, 2]);
    add(s, "plot", 5, 3);
    unchanged(s, { type: "move", id: e.id, x: 3, y: 3, rotated: true });
    expect(apply(s, { type: "move", id: e.id, x: 7, y: 6, rotated: true }).ok).toBe(true);
    expect(entityAt(s, 9, 7)).toBe(e);
    expect(entityAt(s, 7, 8)).toBeUndefined();
  });
  test("empty objects can be removed with a partial refund, occupied ones cannot", () => {
    const s = empty(),
      e = add(s, "plot"),
      coins = s.coins;
    apply(s, { type: "plant", id: e.id, crop: "wheat" });
    unchanged(s, { type: "remove", id: e.id });
    advance(s, NOW + 30_000);
    apply(s, { type: "harvest", id: e.id });
    expect(apply(s, { type: "remove", id: e.id }).ok).toBe(true);
    expect(s.coins).toBe(coins + 6);
    expect(s.entities).toHaveLength(0);
  });
});
describe("Quiet Valley: growing and making", () => {
  test("free wheat keeps a penniless farm playable", () => {
    const s = empty(),
      e = add(s, "plot");
    s.coins = 0;
    expect(apply(s, { type: "plant", id: e.id, crop: "wheat" }).ok).toBe(true);
    advance(s, NOW + 30_000);
    expect(apply(s, { type: "harvest", id: e.id }).ok).toBe(true);
    expect(s.items.wheat).toBe(14);
  });
  test("planting rejects occupied beds and locked crops without payment", () => {
    const s = empty(),
      e = add(s, "plot");
    unchanged(s, { type: "plant", id: e.id, crop: "pumpkin" });
    apply(s, { type: "plant", id: e.id, crop: "carrot" });
    unchanged(s, { type: "plant", id: e.id, crop: "tomato" });
  });
  test("watering accelerates subsequent growth, never charges or stacks", () => {
    const s = empty(),
      e = add(s, "plot");
    apply(s, { type: "plant", id: e.id, crop: "carrot" });
    advance(s, NOW + 10_000);
    expect(e.growth).toBe(10);
    const coins = s.coins;
    apply(s, { type: "water", id: e.id });
    advance(s, NOW + 20_000);
    expect(e.growth).toBeCloseTo(27);
    expect(s.coins).toBe(coins);
    unchanged(s, { type: "water", id: e.id });
  });
  test("ready crops can be harvested exactly once", () => {
    const s = empty(),
      e = add(s, "plot");
    apply(s, { type: "plant", id: e.id, crop: "tomato" });
    unchanged(s, { type: "harvest", id: e.id });
    advance(s, NOW + 65_000);
    expect(apply(s, { type: "harvest", id: e.id })).toEqual({
      ok: true,
      item: "tomato",
      amount: 3,
    });
    expect(e.crop).toBeUndefined();
    expect(s.stats.harvested).toBe(1);
    unchanged(s, { type: "harvest", id: e.id });
  });
  test("wheat becomes flour then bread through two distinct workshops", () => {
    const s = empty(),
      mill = add(s, "mill"),
      kitchen = add(s, "kitchen", 7, 5);
    s.items = { wheat: 3 };
    expect(apply(s, { type: "cook", id: mill.id, recipe: "flour" }).ok).toBe(true);
    expect(s.items.wheat).toBe(0);
    advance(s, NOW + 20_000);
    apply(s, { type: "collect", id: mill.id });
    expect(s.items.flour).toBe(2);
    apply(s, { type: "cook", id: kitchen.id, recipe: "bread" });
    advance(s, NOW + 45_000);
    apply(s, { type: "collect", id: kitchen.id });
    expect(s.items.bread).toBe(1);
    expect(s.items.flour).toBe(0);
    expect(s.stats.cooked).toBe(2);
  });
  test("workshops reject wrong recipes, missing ingredients and double booking", () => {
    const s = empty(),
      k = add(s, "kitchen");
    unchanged(s, { type: "cook", id: k.id, recipe: "cheese" });
    unchanged(s, { type: "cook", id: k.id, recipe: "pie" });
    apply(s, { type: "cook", id: k.id, recipe: "bread" });
    unchanged(s, { type: "cook", id: k.id, recipe: "salad" });
    unchanged(s, { type: "remove", id: k.id });
  });
  test("a cooking job survives movement, rotation and save/reload", () => {
    const s = empty(),
      k = add(s, "kitchen");
    apply(s, { type: "cook", id: k.id, recipe: "bread" });
    advance(s, NOW + 10_000);
    apply(s, { type: "move", id: k.id, x: 7, y: 7, rotated: true });
    const loaded = restore(JSON.parse(JSON.stringify(s)), NOW + 20_000),
      next = loaded.entities[0];
    expect(next.x).toBe(7);
    expect(next.rotated).toBe(true);
    expect(next.job?.progress).toBe(20);
    advance(loaded, NOW + 25_000);
    expect(apply(loaded, { type: "collect", id: next.id }).ok).toBe(true);
    unchanged(loaded, { type: "collect", id: next.id });
  });
  test("two kitchens progress and collect independently", () => {
    const s = empty(),
      a = add(s, "kitchen"),
      b = add(s, "kitchen", 7, 6);
    apply(s, { type: "cook", id: a.id, recipe: "bread" });
    advance(s, NOW + 10_000);
    apply(s, { type: "cook", id: b.id, recipe: "salad" });
    advance(s, NOW + 25_000);
    expect(progress(a)).toBe(1);
    expect(progress(b)).toBeLessThan(1);
    apply(s, { type: "collect", id: a.id });
    expect(b.job?.recipe).toBe("salad");
  });
});
describe("Quiet Valley: animals and economy", () => {
  test("hungry animals produce nothing until fed", () => {
    const s = empty(),
      e = add(s, "coop");
    apply(s, { type: "animal", id: e.id, species: "chicken" });
    advance(s, NOW + 90_000);
    expect(e.animals[0].ready).toBe(0);
    apply(s, { type: "feed", id: e.id });
    advance(s, NOW + 120_000);
    expect(e.animals[0].ready).toBe(1);
    expect(e.animals[0].fed).toBe(90);
  });
  test("feeding a pen is atomic and targets only hungry animals", () => {
    const s = empty(),
      e = add(s, "coop");
    apply(s, { type: "animal", id: e.id, species: "chicken" });
    apply(s, { type: "animal", id: e.id, species: "chicken" });
    s.items.wheat = 1;
    unchanged(s, { type: "feed", id: e.id });
    s.items.wheat = 2;
    apply(s, { type: "feed", id: e.id });
    expect(s.items.wheat).toBe(0);
    unchanged(s, { type: "feed", id: e.id });
  });
  test("animals retain food, timers and stored products when their pen moves", () => {
    const s = empty(),
      e = add(s, "coop");
    apply(s, { type: "animal", id: e.id, species: "chicken" });
    apply(s, { type: "feed", id: e.id });
    advance(s, NOW + 40_000);
    const animals = structuredClone(e.animals);
    apply(s, { type: "move", id: e.id, x: 8, y: 8 });
    expect(e.animals).toEqual(animals);
    unchanged(s, { type: "remove", id: e.id });
    const before = s.items.egg || 0;
    apply(s, { type: "collect", id: e.id });
    expect(s.items.egg).toBe(before + 1);
    unchanged(s, { type: "collect", id: e.id });
  });
  test("pens enforce animal types and four-resident capacity", () => {
    const s = empty(),
      e = add(s, "coop");
    s.coins = 10000;
    unchanged(s, { type: "animal", id: e.id, species: "cow" });
    for (let i = 0; i < 4; i++)
      expect(apply(s, { type: "animal", id: e.id, species: "chicken" }).ok).toBe(true);
    unchanged(s, { type: "animal", id: e.id, species: "chicken" });
  });
  test("a barn produces separate milk and wool inventory", () => {
    const s = empty(),
      e = add(s, "barn");
    s.coins = 1000;
    s.items = { wheat: 4 };
    apply(s, { type: "animal", id: e.id, species: "cow" });
    apply(s, { type: "animal", id: e.id, species: "sheep" });
    apply(s, { type: "feed", id: e.id });
    advance(s, NOW + 55_000);
    apply(s, { type: "collect", id: e.id });
    expect(s.items.milk).toBe(1);
    expect(s.items.wool).toBe(1);
  });
  test("production consumes limited food and caps stored products during long absences", () => {
    const s = empty(),
      e = add(s, "coop");
    apply(s, { type: "animal", id: e.id, species: "chicken" });
    apply(s, { type: "feed", id: e.id });
    advance(s, NOW + 86_400_000);
    expect(e.animals[0].fed).toBe(0);
    expect(e.animals[0].ready).toBe(3);
    apply(s, { type: "collect", id: e.id });
    advance(s, NOW + 90_000_000);
    expect(e.animals[0].ready).toBe(0);
  });
  test("sales and orders spend exact quantities and pay once", () => {
    const s = newFarm(NOW),
      coins = s.coins;
    expect(apply(s, { type: "sell", item: "wheat", count: 2 }).ok).toBe(true);
    expect(s.coins).toBe(coins + 10);
    expect(s.items.wheat).toBe(10);
    apply(s, { type: "order", slot: 0 });
    expect(s.items.wheat).toBe(4);
    expect(s.orders[0]).toBe(3);
    expect(s.coins).toBe(coins + 52);
    unchanged(s, { type: "sell", item: "wheat", count: -1 });
    unchanged(s, { type: "sell", item: "wheat", count: 100 });
    unchanged(s, { type: "order", slot: 0 });
  });
  test("goals reward completed work once, and XP unlocks seeds", () => {
    const s = newFarm(NOW);
    unchanged(s, { type: "goal" });
    s.stats.harvested = 2;
    const coins = s.coins;
    apply(s, { type: "goal" });
    expect(s.coins).toBe(coins + GOALS[0].coins);
    expect(s.goal).toBe(1);
    unchanged(s, { type: "goal" });
    s.xp = 140;
    expect(level(s)).toBe(3);
  });
});
describe("Quiet Valley: persistence boundaries", () => {
  test("reloading with the same clock never duplicates offline progress", () => {
    const s = empty(),
      e = add(s, "plot");
    apply(s, { type: "plant", id: e.id, crop: "carrot" });
    const a = restore(s, NOW + 10_000),
      b = restore(a, NOW + 10_000);
    expect(a.entities[0].growth).toBe(10);
    expect(b.entities[0].growth).toBe(10);
    advance(b, NOW);
    expect(b.entities[0].growth).toBe(10);
  });
  test("corrupt and older-edition saves cannot inject invalid state", () => {
    for (const raw of [null, {}, { grid: [] }, { energy: 10, plots: [] }])
      expect(restore(raw, NOW)).toEqual(newFarm(NOW));
    const s = newFarm(NOW),
      raw = JSON.parse(JSON.stringify(s));
    raw.coins = Infinity;
    raw.items = { wheat: -5, milk: "lots", unrecognized: 90 };
    raw.xp = NaN;
    raw.entities.push({ ...raw.entities[0] });
    raw.entities.push({ ...raw.entities[0], id: 999, x: 3.1, y: 3 });
    raw.entities.push({ id: 999, kind: "__proto__", x: 5, y: 8 });
    const loaded = restore(raw, NOW);
    expect(loaded.coins).toBe(640);
    expect(loaded.xp).toBe(0);
    expect(loaded.items.wheat).toBe(0);
    expect(loaded.items.milk).toBe(0);
    expect(loaded.entities).toHaveLength(s.entities.length);
  });
  test("invalid jobs and misplaced animal species are discarded", () => {
    const s = newFarm(NOW),
      k = s.entities.find((e) => e.kind === "kitchen"),
      coop = s.entities.find((e) => e.kind === "coop");
    if (!k || !coop) throw new Error("Missing starter buildings");
    k.job = { recipe: "cheese", progress: Infinity };
    coop.animals = [{ species: "cow", fed: Infinity, ready: 999, progress: 999 }];
    const loaded = restore(s, NOW);
    expect(loaded.entities.find((e) => e.id === k.id)?.job).toBeNull();
    expect(loaded.entities.find((e) => e.id === coop.id)?.animals).toHaveLength(0);
  });
  test("every production recipe and animal uses a real building", () => {
    for (const recipe of Object.values(RECIPES)) expect(BUILDINGS[recipe.at]).toBeDefined();
    for (const animal of Object.values(ANIMALS)) expect(BUILDINGS[animal.kind]).toBeDefined();
    for (const crop of Object.values(CROPS)) expect(crop.seconds).toBeGreaterThan(0);
  });
});

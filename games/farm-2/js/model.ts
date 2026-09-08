import {
  ANIMALS,
  BUILDINGS,
  CROPS,
  type Crop,
  GOALS,
  ITEMS,
  type Item,
  type Kind,
  ORDER_POOL,
  RECIPES,
  type Recipe,
  SIZE,
  type Species,
} from "./data";

export interface Animal {
  species: Species;
  fed: number;
  progress: number;
  ready: number;
}
export interface Entity {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  rotated: boolean;
  crop?: Crop;
  growth: number;
  watered: boolean;
  animals: Animal[];
  job: { recipe: Recipe; progress: number } | null;
}
export interface Farm {
  schema: 1;
  coins: number;
  xp: number;
  items: Partial<Record<Item, number>>;
  entities: Entity[];
  nextId: number;
  lastTick: number;
  orders: number[];
  nextOrder: number;
  goal: number;
  stats: Record<"harvested" | "built" | "fed" | "cooked" | "delivered" | "moved", number>;
}
export type Action =
  | { type: "build"; kind: Kind; x: number; y: number; rotated?: boolean }
  | { type: "move"; id: number; x: number; y: number; rotated?: boolean }
  | { type: "plant"; id: number; crop: Crop }
  | { type: "harvest" | "water" | "feed" | "collect" | "remove"; id: number }
  | { type: "animal"; id: number; species: Species }
  | { type: "cook"; id: number; recipe: Recipe }
  | { type: "sell"; item: Item; count: number }
  | { type: "order"; slot: number }
  | { type: "goal" };
export type Result =
  | { ok: true; id?: number; amount?: number; item?: Item }
  | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
export const level = (s: Farm): number => 1 + Math.floor(s.xp / 70);
export function dimensions(kind: Kind, rotated = false): [number, number] {
  const d = BUILDINGS[kind];
  return rotated ? [d.h, d.w] : [d.w, d.h];
}
// Corners form a softer island silhouette; every visible grass tile can be built on.
export function land(x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < SIZE &&
    y < SIZE &&
    x + y >= 2 &&
    x + y <= 20
  );
}
export function occupies(e: Entity, x: number, y: number): boolean {
  const [w, h] = dimensions(e.kind, e.rotated);
  return x >= e.x && y >= e.y && x < e.x + w && y < e.y + h;
}
export function entityAt(s: Farm, x: number, y: number): Entity | undefined {
  return s.entities.find((e) => occupies(e, x, y));
}
export function fits(
  s: Farm,
  kind: Kind,
  x: number,
  y: number,
  rotated = false,
  ignore?: number,
): boolean {
  const [w, h] = dimensions(kind, rotated);
  for (let dx = 0; dx < w; dx++)
    for (let dy = 0; dy < h; dy++) {
      if (
        !land(x + dx, y + dy) ||
        s.entities.some((e) => e.id !== ignore && occupies(e, x + dx, y + dy))
      )
        return false;
    }
  return true;
}
function makeEntity(s: Farm, kind: Kind, x: number, y: number, rotated = false): Entity {
  const e: Entity = {
    id: s.nextId++,
    kind,
    x,
    y,
    rotated,
    growth: 0,
    watered: false,
    animals: [],
    job: null,
  };
  s.entities.push(e);
  return e;
}
export function newFarm(now = Date.now()): Farm {
  const s: Farm = {
    schema: 1,
    coins: 640,
    xp: 0,
    items: { wheat: 12, carrot: 6, tomato: 4, flour: 4, egg: 3, milk: 3 },
    entities: [],
    nextId: 1,
    lastTick: now,
    orders: [0, 1, 2],
    nextOrder: 3,
    goal: 0,
    stats: { harvested: 0, built: 0, fed: 0, cooked: 0, delivered: 0, moved: 0 },
  };
  makeEntity(s, "cottage", 2, 2);
  makeEntity(s, "kitchen", 7, 2);
  const coop = makeEntity(s, "coop", 7, 6);
  coop.animals = [
    { species: "chicken", fed: 0, progress: 0, ready: 1 },
    { species: "chicken", fed: 0, progress: 0, ready: 0 },
  ];
  makeEntity(s, "silo", 5, 2);
  makeEntity(s, "well", 5, 4);
  for (let x = 2; x <= 4; x++)
    for (let y = 6; y <= 8; y++) {
      const e = makeEntity(s, "plot", x, y);
      if (y < 8) {
        e.crop = x === 2 ? "wheat" : x === 3 ? "carrot" : "tomato";
        e.growth = CROPS[e.crop].seconds;
      }
    }
  for (const [x, y] of [
    [3, 4],
    [3, 5],
    [4, 5],
    [5, 5],
    [6, 5],
    [7, 5],
    [8, 5],
    [6, 4],
    [6, 3],
  ])
    makeEntity(s, "path", x, y);
  for (const [x, y] of [
    [1, 4],
    [2, 10],
    [9, 3],
    [10, 7],
  ])
    makeEntity(s, "tree", x, y);
  for (const [x, y] of [
    [1, 6],
    [1, 7],
    [1, 8],
    [6, 8],
    [7, 8],
    [8, 8],
  ])
    makeEntity(s, "fence", x, y);
  return s;
}
export function canPay(s: Farm, ingredients: Partial<Record<Item, number>>): boolean {
  return (Object.entries(ingredients) as [Item, number][]).every(
    ([id, n]) => (s.items[id] || 0) >= n,
  );
}
function pay(s: Farm, ingredients: Partial<Record<Item, number>>): void {
  for (const [id, n] of Object.entries(ingredients) as [Item, number][])
    s.items[id] = (s.items[id] || 0) - n;
}
function add(s: Farm, item: Item, count: number): void {
  s.items[item] = (s.items[item] || 0) + count;
}
export function progress(e: Entity): number {
  if (e.crop) return Math.min(1, e.growth / CROPS[e.crop].seconds);
  if (e.job) return Math.min(1, e.job.progress / RECIPES[e.job.recipe].seconds);
  if (e.animals.length)
    return e.animals.some((a) => a.ready > 0)
      ? 1
      : Math.max(...e.animals.map((a) => a.progress / ANIMALS[a.species].seconds));
  return 0;
}
export function advance(s: Farm, now = Date.now()): void {
  if (!Number.isFinite(now) || now <= s.lastTick) return;
  const seconds = Math.min(7200, (now - s.lastTick) / 1000);
  s.lastTick = now;
  for (const e of s.entities) {
    if (e.crop)
      e.growth = Math.min(CROPS[e.crop].seconds, e.growth + seconds * (e.watered ? 1.7 : 1));
    if (e.job) e.job.progress = Math.min(RECIPES[e.job.recipe].seconds, e.job.progress + seconds);
    for (const a of e.animals) {
      const active = Math.min(seconds, a.fed);
      a.fed = Math.max(0, a.fed - seconds);
      const cycle = ANIMALS[a.species].seconds;
      const total = a.progress + active;
      a.ready = Math.min(3, a.ready + Math.floor(total / cycle));
      a.progress = a.ready === 3 ? 0 : total % cycle;
    }
  }
}
export function apply(s: Farm, a: Action): Result {
  if (a.type === "build") {
    const def = BUILDINGS[a.kind];
    if (!def || a.kind === "cottage") return fail("unavailable");
    if (!fits(s, a.kind, a.x, a.y, a.rotated)) return fail("occupied");
    if (s.coins < def.cost) return fail("noMoney");
    s.coins -= def.cost;
    const e = makeEntity(s, a.kind, a.x, a.y, a.rotated);
    s.stats.built++;
    s.xp += a.kind === "path" || a.kind === "fence" ? 1 : 3;
    return { ok: true, id: e.id };
  }
  if (a.type === "sell") {
    if (
      !ITEMS[a.item] ||
      !Number.isInteger(a.count) ||
      a.count <= 0 ||
      (s.items[a.item] || 0) < a.count
    )
      return fail("noIngredients");
    s.items[a.item] = (s.items[a.item] || 0) - a.count;
    s.coins += ITEMS[a.item].price * a.count;
    return { ok: true, amount: ITEMS[a.item].price * a.count };
  }
  if (a.type === "order") {
    if (!Number.isInteger(a.slot) || a.slot < 0 || a.slot >= s.orders.length)
      return fail("unavailable");
    const order = ORDER_POOL[s.orders[a.slot] % ORDER_POOL.length];
    if (!canPay(s, order.items)) return fail("noIngredients");
    pay(s, order.items);
    s.coins += order.coins;
    s.xp += order.xp;
    s.stats.delivered++;
    s.orders[a.slot] = s.nextOrder++;
    return { ok: true, amount: order.coins };
  }
  if (a.type === "goal") {
    const goal = GOALS[s.goal];
    if (!goal || s.stats[goal.stat] < goal.target) return fail("notReady");
    s.coins += goal.coins;
    s.goal++;
    return { ok: true, amount: goal.coins };
  }
  const e = s.entities.find((e) => e.id === a.id);
  if (!e) return fail("selectFirst");
  if (a.type === "move") {
    const rotated = a.rotated ?? e.rotated;
    if (!fits(s, e.kind, a.x, a.y, rotated, e.id)) return fail("occupied");
    if (e.x === a.x && e.y === a.y && e.rotated === rotated) return { ok: true, id: e.id };
    e.x = a.x;
    e.y = a.y;
    e.rotated = rotated;
    s.stats.moved++;
    return { ok: true, id: e.id };
  }
  if (a.type === "remove") {
    if (e.kind === "cottage" || e.crop || e.job || e.animals.length) return fail("cannotRemove");
    s.entities = s.entities.filter((b) => b !== e);
    const refund = Math.floor(BUILDINGS[e.kind].cost / 2);
    s.coins += refund;
    return { ok: true, amount: refund };
  }
  if (a.type === "plant") {
    if (e.kind !== "plot" || e.crop || !CROPS[a.crop]) return fail("needEmpty");
    const crop = CROPS[a.crop];
    if (level(s) < crop.level) return fail("locked");
    if (s.coins < crop.cost) return fail("noMoney");
    s.coins -= crop.cost;
    e.crop = a.crop;
    e.growth = 0;
    e.watered = false;
    return { ok: true, id: e.id };
  }
  if (a.type === "water") {
    if (!e.crop || progress(e) >= 1 || e.watered) return fail("nothingWater");
    e.watered = true;
    return { ok: true, id: e.id };
  }
  if (a.type === "harvest") {
    if (!e.crop || progress(e) < 1) return fail("notReady");
    const id = e.crop,
      crop = CROPS[id];
    add(s, id, crop.yield);
    s.xp += crop.xp;
    s.stats.harvested++;
    delete e.crop;
    e.growth = 0;
    e.watered = false;
    return { ok: true, amount: crop.yield, item: id };
  }
  if (a.type === "animal") {
    const animal = ANIMALS[a.species];
    if (!animal || animal.kind !== e.kind) return fail("unavailable");
    if (e.animals.length >= 4) return fail("fullPen");
    if (s.coins < animal.cost) return fail("noMoney");
    s.coins -= animal.cost;
    e.animals.push({ species: a.species, fed: 0, progress: 0, ready: 0 });
    return { ok: true, id: e.id };
  }
  if (a.type === "feed") {
    const hungry = e.animals.filter((a) => a.fed <= 0);
    if (!hungry.length) return fail("alreadyFed");
    const cost = hungry.reduce((n, a) => n + ANIMALS[a.species].feed, 0);
    if ((s.items.wheat || 0) < cost) return fail("noIngredients");
    pay(s, { wheat: cost });
    for (const a of hungry) a.fed = 120;
    s.stats.fed += hungry.length;
    return { ok: true, id: e.id };
  }
  if (a.type === "cook") {
    const recipe = RECIPES[a.recipe];
    if (!recipe || recipe.at !== e.kind) return fail("unavailable");
    if (e.job) return fail("busy");
    if (!canPay(s, recipe.ingredients)) return fail("noIngredients");
    pay(s, recipe.ingredients);
    e.job = { recipe: a.recipe, progress: 0 };
    return { ok: true, id: e.id };
  }
  if (a.type === "collect") {
    if (e.job) {
      if (progress(e) < 1) return fail("notReady");
      const id = e.job.recipe,
        recipe = RECIPES[id];
      add(s, id, recipe.amount);
      s.xp += recipe.xp;
      s.stats.cooked++;
      e.job = null;
      return { ok: true, item: id, amount: recipe.amount };
    }
    const available = e.animals.reduce((n, a) => n + a.ready, 0);
    if (!available) return fail("notReady");
    let count = 0;
    for (const a of e.animals) {
      add(s, ANIMALS[a.species].product, a.ready);
      count += a.ready;
      a.ready = 0;
    }
    s.xp += count * 3;
    return { ok: true, amount: count };
  }
  return fail("unavailable");
}

const number = (v: unknown, max: number, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : fallback;
const integer = (v: unknown, max: number, fallback = 0): number =>
  Math.floor(number(v, max, fallback));
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const own = (obj: object, key: unknown): key is string =>
  typeof key === "string" && Object.hasOwn(obj, key);
/** Validate untrusted saves into fresh typed objects. Layout and production are independent. */
export function restore(raw: unknown, now = Date.now()): Farm {
  const d = record(raw);
  if (d.schema !== 1 || !Array.isArray(d.entities)) return newFarm(now);
  const s = newFarm(now);
  s.entities = [];
  s.items = {};
  s.coins = number(d.coins, 1e9, 640);
  s.xp = integer(d.xp, 1e7);
  for (const [id, n] of Object.entries(record(d.items)))
    if (own(ITEMS, id)) s.items[id as Item] = integer(n, 1e7);
  const seen = new Set<number>();
  for (const raw of d.entities.slice(0, 144)) {
    const e = record(raw);
    if (!own(BUILDINGS, e.kind)) continue;
    const kind = e.kind as Kind,
      id = integer(e.id, 1e7);
    if (
      !id ||
      seen.has(id) ||
      typeof e.x !== "number" ||
      typeof e.y !== "number" ||
      !fits(s, kind, e.x, e.y, e.rotated === true)
    )
      continue;
    seen.add(id);
    const out: Entity = {
      id,
      kind,
      x: e.x,
      y: e.y,
      rotated: e.rotated === true,
      growth: 0,
      watered: false,
      animals: [],
      job: null,
    };
    if (kind === "plot" && own(CROPS, e.crop)) {
      out.crop = e.crop as Crop;
      out.growth = number(e.growth, CROPS[out.crop].seconds);
      out.watered = e.watered === true;
    }
    if (Array.isArray(e.animals))
      for (const raw of e.animals.slice(0, 4)) {
        const a = record(raw);
        if (!own(ANIMALS, a.species)) continue;
        const species = a.species as Species;
        if (ANIMALS[species].kind === kind)
          out.animals.push({
            species,
            fed: number(a.fed, 120),
            progress: number(a.progress, ANIMALS[species].seconds),
            ready: integer(a.ready, 3),
          });
      }
    const job = record(e.job);
    if (own(RECIPES, job.recipe) && RECIPES[job.recipe as Recipe].at === kind)
      out.job = {
        recipe: job.recipe as Recipe,
        progress: number(job.progress, RECIPES[job.recipe as Recipe].seconds),
      };
    s.entities.push(out);
  }
  if (!s.entities.length) return newFarm(now);
  s.nextId = Math.max(...s.entities.map((e) => e.id), 0) + 1;
  s.orders = [0, 1, 2].map((v, i) => (Array.isArray(d.orders) ? integer(d.orders[i], 1e7, v) : v));
  s.nextOrder = Math.max(integer(d.nextOrder, 1e7, 3), ...s.orders.map((n) => n + 1));
  s.goal = integer(d.goal, GOALS.length);
  const stats = record(d.stats);
  for (const key of Object.keys(s.stats) as (keyof Farm["stats"])[])
    s.stats[key] = integer(stats[key], 1e7);
  s.lastTick = Math.min(now, number(d.lastTick, now, now));
  advance(s, now);
  return s;
}

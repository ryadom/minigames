/** Meadow Days: deterministic, turn-based rules, independent of the DOM. */
export const CROPS = {
  wheat: { icon: "🌾", seed: 0, days: 2, price: 5, yield: 2, xp: 3, level: 1, season: 2 },
  carrot: { icon: "🥕", seed: 4, days: 2, price: 8, yield: 2, xp: 4, level: 1, season: 0 },
  potato: { icon: "🥔", seed: 8, days: 3, price: 14, yield: 2, xp: 6, level: 2, season: 3 },
  tomato: { icon: "🍅", seed: 12, days: 3, price: 18, yield: 3, xp: 8, level: 3, season: 1 },
  strawberry: { icon: "🍓", seed: 20, days: 4, price: 30, yield: 2, xp: 10, level: 4, season: 0 },
  pumpkin: { icon: "🎃", seed: 30, days: 5, price: 48, yield: 2, xp: 14, level: 5, season: 2 },
} as const;
export type CropId = keyof typeof CROPS;
export const CROP_IDS = Object.keys(CROPS) as CropId[];
export type ItemId = CropId | "egg";
export const ITEM_IDS: ItemId[] = [...CROP_IDS, "egg"];
export const MAX_PLOTS = 24;
export const SEASON_DAYS = 8;
export const LEVEL_XP = [0, 20, 55, 110, 190, 300, 440, 610, 800];
export type Tool = "plant" | "water" | "harvest";
export type Upgrade = "land" | "well" | "coop";
export interface Plot {
  crop: CropId | null;
  growth: number;
  watered: boolean;
}
export interface Order {
  item: ItemId;
  quantity: number;
  coins: number;
  xp: number;
}
export interface Farm {
  day: number;
  coins: number;
  xp: number;
  energy: number;
  plots: Plot[];
  inventory: Record<ItemId, number>;
  orders: Order[];
  delivered: number;
  harvested: number;
  well: number;
  hens: number;
  milestone: number;
}
export type Result = {
  ok: boolean;
  message: string;
  values?: Record<string, string | number>;
};

const emptyPlot = (): Plot => ({ crop: null, growth: 0, watered: false });
const fail = (message: string): Result => ({ ok: false, message });
const success = (message: string, values?: Result["values"]): Result => ({
  ok: true,
  message,
  values,
});
export const season = (day: number): number => Math.floor((day - 1) / SEASON_DAYS) % 4;
export const seasonDay = (day: number): number => ((day - 1) % SEASON_DAYS) + 1;
export function level(farm: Farm): number {
  return LEVEL_XP.filter((xp) => farm.xp >= xp).length;
}
export const maxEnergy = (farm: Farm): number => 24 + farm.well * 8;
export function weather(day: number): "sunny" | "cloudy" | "rainy" {
  if (day === 1) return "sunny";
  // Stable across reloads, with no clock or random-number dependency.
  const n = ((day * 13 + Math.floor(day / 7) * 3) % 11) / 11;
  return n < 0.32 ? "rainy" : n < 0.58 ? "cloudy" : "sunny";
}
export function price(farm: Farm, item: ItemId): number {
  if (item === "egg") return 12;
  return Math.round(CROPS[item].price * (CROPS[item].season === season(farm.day) ? 1.25 : 1));
}
export const ready = (plot: Plot): boolean =>
  plot.crop !== null && plot.growth >= CROPS[plot.crop].days;

function makeOrder(farm: Farm, slot: number): Order {
  const available: ItemId[] = CROP_IDS.filter((id) => CROPS[id].level <= level(farm));
  if (farm.hens > 0) available.push("egg");
  const seed = farm.delivered * 7 + slot * 3;
  const item = available[seed % available.length];
  const quantity = 2 + (seed % 3);
  const base = item === "egg" ? 12 : CROPS[item].price;
  return { item, quantity, coins: Math.ceil(base * quantity * 1.6) + 10, xp: 8 + quantity };
}

export function createFarm(): Farm {
  const farm: Farm = {
    day: 1,
    coins: 80,
    xp: 0,
    energy: 24,
    plots: Array.from({ length: 12 }, emptyPlot),
    inventory: { wheat: 0, carrot: 0, potato: 0, tomato: 0, strawberry: 0, pumpkin: 0, egg: 0 },
    orders: [],
    delivered: 0,
    harvested: 0,
    well: 0,
    hens: 0,
    milestone: 0,
  };
  farm.plots[0] = { crop: "wheat", growth: 2, watered: false };
  farm.plots[1] = { crop: "wheat", growth: 2, watered: false };
  farm.plots[4] = { crop: "carrot", growth: 1, watered: false };
  farm.plots[5] = { crop: "carrot", growth: 1, watered: false };
  farm.orders = [0, 1, 2].map((slot) => makeOrder(farm, slot));
  return farm;
}

/** A failed action is atomic: no money, energy or items are spent. */
export function workPlot(farm: Farm, index: number, tool: Tool, crop: CropId): Result {
  if (!Number.isInteger(index) || !farm.plots[index]) return fail("lockedPlot");
  const plot = farm.plots[index];
  if (tool === "harvest") {
    if (!ready(plot) || !plot.crop) return fail("notReady");
    if (farm.energy < 1) return fail("noEnergy");
    const id = plot.crop;
    farm.inventory[id] += CROPS[id].yield;
    farm.xp += CROPS[id].xp;
    farm.harvested += 1;
    farm.energy -= 1;
    farm.plots[index] = emptyPlot();
    return success("harvested", { item: id, n: CROPS[id].yield });
  }
  if (tool === "water") {
    if (!plot.crop) return fail("plantFirst");
    if (ready(plot)) return fail("readyHint");
    if (plot.watered || weather(farm.day) === "rainy") return fail("alreadyWatered");
    if (farm.energy < 1) return fail("noEnergy");
    plot.watered = true;
    farm.energy -= 1;
    return success("watered");
  }
  if (plot.crop) return fail(ready(plot) ? "readyHint" : "occupied");
  if (!CROP_IDS.includes(crop)) return fail("unknownCrop");
  const def = CROPS[crop];
  if (level(farm) < def.level) return fail("levelRequired");
  if (farm.coins < def.seed) return fail("noCoins");
  if (farm.energy < 1) return fail("noEnergy");
  farm.coins -= def.seed;
  farm.energy -= 1;
  farm.plots[index] = { crop, growth: 0, watered: weather(farm.day) === "rainy" };
  return success("planted", { item: crop });
}

export function sell(farm: Farm, item: ItemId, quantity: number): Result {
  if (!ITEM_IDS.includes(item) || !Number.isSafeInteger(quantity) || quantity < 1) {
    return fail("nothingToSell");
  }
  if (farm.inventory[item] < quantity) return fail("nothingToSell");
  const coins = price(farm, item) * quantity;
  farm.inventory[item] -= quantity;
  farm.coins += coins;
  return success("sold", { coins });
}
export function deliver(farm: Farm, slot: number): Result {
  const order = farm.orders[slot];
  if (!Number.isInteger(slot) || !order || farm.inventory[order.item] < order.quantity) {
    return fail("missingItems");
  }
  farm.inventory[order.item] -= order.quantity;
  farm.coins += order.coins;
  farm.xp += order.xp;
  farm.delivered += 1;
  farm.orders[slot] = makeOrder(farm, slot);
  return success("delivered", { coins: order.coins, xp: order.xp });
}

export function upgradeCost(farm: Farm, kind: Upgrade): number | null {
  if (kind === "land")
    return farm.plots.length >= MAX_PLOTS ? null : 90 + (farm.plots.length - 12) * 15;
  if (kind === "well") return farm.well >= 2 ? null : 120 + farm.well * 140;
  return farm.hens >= 3 ? null : 160 + farm.hens * 100;
}
export function upgrade(farm: Farm, kind: Upgrade): Result {
  const cost = upgradeCost(farm, kind);
  if (cost === null) return fail("maxed");
  if (kind === "coop" && level(farm) < 2) return fail("levelRequired");
  if (farm.coins < cost) return fail("noCoins");
  farm.coins -= cost;
  if (kind === "land") farm.plots.push(...Array.from({ length: 4 }, emptyPlot));
  else if (kind === "well") {
    farm.well += 1;
    farm.energy += 8;
  } else farm.hens += 1;
  return success("upgraded");
}

export interface DayReport {
  grown: number;
  dry: number;
  eggs: number;
  hungry: number;
}
/** No offline penalties: only this command advances the farm's calendar. */
export function endDay(farm: Farm): DayReport {
  const report: DayReport = { grown: 0, dry: 0, eggs: 0, hungry: 0 };
  for (const plot of farm.plots) {
    if (!plot.crop || ready(plot)) continue;
    if (plot.watered || weather(farm.day) === "rainy") {
      plot.growth += 1;
      if (ready(plot)) report.grown += 1;
    } else report.dry += 1;
  }
  const fed = Math.min(farm.hens, farm.inventory.wheat);
  farm.inventory.wheat -= fed;
  report.eggs = fed * 2;
  report.hungry = farm.hens - fed;
  farm.inventory.egg += report.eggs;
  farm.day += 1;
  farm.energy = maxEnergy(farm);
  for (const plot of farm.plots) plot.watered = !!plot.crop && weather(farm.day) === "rainy";
  return report;
}

export const MILESTONES = [
  { id: "harvest", goal: 6, reward: 40 },
  { id: "orders", goal: 3, reward: 80 },
  { id: "land", goal: 16, reward: 60 },
  { id: "hens", goal: 1, reward: 75 },
  { id: "season", goal: 9, reward: 100 },
] as const;
export function milestoneProgress(farm: Farm): number {
  return (
    [farm.harvested, farm.delivered, farm.plots.length, farm.hens, farm.day][farm.milestone] ?? 0
  );
}
export function claimMilestone(farm: Farm): Result {
  const goal = MILESTONES[farm.milestone];
  if (!goal || milestoneProgress(farm) < goal.goal) return fail("goalIncomplete");
  farm.coins += goal.reward;
  farm.milestone += 1;
  return success("goalClaimed", { coins: goal.reward });
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function integer(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}
/** Validate saves at the boundary; never let malformed data into the rules. */
export function restoreFarm(value: unknown): Farm {
  const data = record(value);
  const farm = createFarm();
  farm.day = integer(data.day, 1, 1, 1_000_000);
  farm.coins = integer(data.coins, 80, 0, 1_000_000_000);
  farm.xp = integer(data.xp, 0, 0, 1_000_000_000);
  farm.well = integer(data.well, 0, 0, 2);
  farm.hens = integer(data.hens, 0, 0, 3);
  farm.energy = integer(data.energy, maxEnergy(farm), 0, maxEnergy(farm));
  farm.delivered = integer(data.delivered, 0, 0, 1_000_000);
  farm.harvested = integer(data.harvested, 0, 0, 1_000_000);
  farm.milestone = integer(data.milestone, 0, 0, MILESTONES.length);
  const inv = record(data.inventory);
  for (const id of ITEM_IDS) farm.inventory[id] = integer(inv[id], 0, 0, 1_000_000_000);
  if (Array.isArray(data.plots) && [12, 16, 20, 24].includes(data.plots.length)) {
    farm.plots = data.plots.map((raw) => {
      const p = record(raw);
      const crop = CROP_IDS.find((id) => id === p.crop);
      return crop
        ? { crop, growth: integer(p.growth, 0, 0, CROPS[crop].days), watered: p.watered === true }
        : emptyPlot();
    });
  }
  const orders = Array.isArray(data.orders) ? data.orders : [];
  farm.orders = [0, 1, 2].map((slot) => {
    const order = record(orders[slot]);
    const item = ITEM_IDS.find((id) => id === order.item);
    if (!item || (item === "egg" ? farm.hens === 0 : CROPS[item].level > level(farm))) {
      return makeOrder(farm, slot);
    }
    const quantity = integer(order.quantity, 2, 2, 4);
    const base = item === "egg" ? 12 : CROPS[item].price;
    return { item, quantity, coins: Math.ceil(base * quantity * 1.6) + 10, xp: 8 + quantity };
  });
  return farm;
}

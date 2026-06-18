/* ============================================================================
 *  Farm — economy & progression rules.
 *
 *  Pure-ish domain logic that operates on the live game state: the inventory,
 *  market pricing, XP / levelling, the upgrade-cost curves, the multipliers
 *  the various upgrades apply, and order (quest) generation. Nothing here
 *  touches the DOM directly (besides updating header stats / toasts when you
 *  level up).
 * ========================================================================== */

import { MG } from "../../../shared/mg";
import {
  ANIMAL_BY_ID,
  ANIMAL_FOR_PROD,
  ANIMALS,
  APIARY_LVL,
  CROP_BY_ID,
  CROPS,
  DISH_BY_ID,
  DISHES,
  FLOWER_BY_ID,
  FLOWERS,
  HEATER_STEP,
  ITEM,
  MARKET_MS,
  OVEN_STEP,
  SOIL_STEP,
  START_PLOTS,
  START_POTS,
  TRADE_STEP,
} from "./config";
import { tf } from "./i18n";
import { ui } from "./runtime";
import { need, state } from "./state";
import type { Quest, State } from "./types";
import { toast } from "./view";

/* ---- Upgrade multipliers (depend on current upgrade levels) ---- */
// Sprinkler waters every dry, growing plot on this cadence; higher levels
// run it more often.
export function sprinkleEvery(): number {
  return Math.max(7000, 30000 - (state.sprinkler - 1) * 6000);
}
export function soilMul(): number {
  return 1 + (state.soil || 0) * SOIL_STEP;
}
export function cookMul(): number {
  return 1 + (state.oven || 0) * OVEN_STEP;
} // divides cook time
export function flowerMul(): number {
  return 1 + (state.heater || 0) * HEATER_STEP;
} // divides grow time
export function tradeMul(): number {
  return 1 + (state.trade || 0) * TRADE_STEP;
} // scales sell price

/* ---- Inventory ---- */
export function invCount(): number {
  let n = 0;
  for (const k in state.inv) n += state.inv[k];
  return n;
}
export function spaceLeft(): number {
  return state.cap - invCount();
}
export function addItem(id: string, n: number): void {
  state.inv[id] = (state.inv[id] || 0) + n;
}
export function takeItem(id: string, n: number): void {
  const have = state.inv[id] || 0;
  if (have <= n) delete state.inv[id];
  else state.inv[id] = have - n;
}
export function hasRecipe(rec: Record<string, number>): boolean {
  for (const k in rec) if ((state.inv[k] || 0) < rec[k]) return false;
  return true;
}
export function held(id: string): number {
  return state.inv[id] || 0;
}

// A small chip showing how much of an item is currently in storage.
export function stk(id: string): string {
  const n = held(id);
  return `<span class="stk${n ? "" : " zero"}">📦 ${n}</span>`;
}

/* ---- Unlocks ---- */
export function isUnlocked(lvl: number, st?: State): boolean {
  return (st || state).level >= lvl;
}
export function itemUnlocked(id: string, st?: State): boolean {
  if (CROP_BY_ID[id]) return isUnlocked(CROP_BY_ID[id].lvl, st);
  if (FLOWER_BY_ID[id]) return isUnlocked(FLOWER_BY_ID[id].lvl, st);
  if (DISH_BY_ID[id]) return isUnlocked(DISH_BY_ID[id].lvl, st);
  if (ANIMAL_FOR_PROD[id]) return isUnlocked(ANIMAL_FOR_PROD[id].lvl, st);
  if (id === "honey") return isUnlocked(APIARY_LVL, st);
  return true;
}

/* ---- Market pricing ---- */
export function price(id: string): number {
  const base = ITEM[id] ? ITEM[id].sell : 0;
  const m = state.prices[id] || 1;
  return Math.max(1, Math.round(base * m * tradeMul()));
}

export function rollMarket(s: State, force?: boolean): void {
  if (!force && s.marketUntil && Date.now() < s.marketUntil) return;
  s.prices = {};
  for (const id in ITEM) s.prices[id] = 0.75 + Math.random() * 0.6; // 0.75 – 1.35
  s.marketUntil = Date.now() + MARKET_MS;
}

/* ---- XP / levelling ---- */
export function addXp(n: number): void {
  state.xp += n;
  let leveled = false;
  let last = 0;
  while (state.xp >= need(state.level)) {
    state.xp -= need(state.level);
    state.level++;
    leveled = true;
    last = state.level;
    const bonus = state.level * 12;
    state.coins += bonus;
    toast(tf("levelUp", { n: state.level, c: bonus }));
  }
  if (leveled) {
    const un = unlocksAt(last);
    if (un)
      setTimeout(() => {
        toast(`${MG.i18n.t("unlocked")} ${un}`);
      }, 900);
    ui.setStat("level", state.level);
    const statEl = ui.stat("level");
    statEl?.classList.add("mg-flash");
    setTimeout(() => {
      ui.stat("level")?.classList.remove("mg-flash");
    }, 400);
  }
}

export function unlocksAt(level: number): string {
  const out: string[] = [];
  CROPS.forEach((c) => {
    if (c.lvl === level) out.push(c.ico);
  });
  FLOWERS.forEach((f) => {
    if (f.lvl === level) out.push(f.ico);
  });
  ANIMALS.forEach((a) => {
    if (a.lvl === level) out.push(a.ico);
  });
  DISHES.forEach((d) => {
    if (d.lvl === level) out.push(d.ico);
  });
  if (level === APIARY_LVL) out.push("🐝");
  return out.join(" ");
}

/* ---- Orders / quests ---- */
export function deliverablePool(st: State): string[] {
  const ids: string[] = [];
  for (const id in ITEM) if (itemUnlocked(id, st)) ids.push(id);
  return ids;
}
export function makeQuest(s: State): Quest {
  let pool = deliverablePool(s);
  const taken: Record<string, boolean> = {};
  (s.quests || []).forEach((q) => {
    if (q) taken[q.item] = true;
  });
  const fresh = pool.filter((id) => !taken[id]);
  if (fresh.length) pool = fresh;
  const item = pool[Math.floor(Math.random() * pool.length)] || "wheat";
  const base = ITEM[item].sell;
  const maxN = base > 60 ? 2 : 3;
  const n = 1 + Math.floor(Math.random() * maxN);
  const coins = Math.round(base * n * 1.7) + s.level * 4;
  const xp = Math.max(3, Math.round(base / 4)) * n;
  return { item, need: n, coins, xp };
}

/* ---- Upgrade / purchase cost curves ---- */
export function feederCost(type: string): number {
  return Math.round(ANIMAL_BY_ID[type].cost * 1.4);
}
export function collectorCost(type: string): number {
  return Math.round(ANIMAL_BY_ID[type].cost * 1.8);
}
export function plotCost(): number {
  return 40 + (state.unlocked - START_PLOTS) * 40;
}
export function potCost(): number {
  return 70 + (state.potCap - START_POTS) * 90;
}
export function hiveCost(): number {
  return 90 + state.hives.length * 120;
}
export function capCost(): number {
  return Math.round(state.cap * 0.9);
}
export function stoveCost(): number {
  return 90 + (state.stoves - 1) * 110;
}
export function soilCost(): number {
  return 80 + state.soil * 130;
}
export function sprinklerCost(): number {
  return 120 + state.sprinkler * 170;
}
export function ovenCost(): number {
  return 130 + state.oven * 150;
}
export function heaterCost(): number {
  return 130 + state.heater * 150;
}
export function tradeCost(): number {
  return 160 + state.trade * 180;
}

/* ============================================================================
 *  Farm — actions (the command layer).
 *
 *  Every player intent funnels through `handle(act, arg)`, which dispatches to
 *  the small action functions below. These mutate state, persist, re-render
 *  and toast. The hold-and-sweep gestures (field / pens) use the `act*` +
 *  `agg` helpers so a whole sweep aggregates into one summary toast and a
 *  single render — those are driven by the input controller.
 * ========================================================================== */
import { MG } from "../../../shared/mg";
import {
  ANIMAL_BY_ID,
  APIARY_LVL,
  CROP_BY_ID,
  DISH_BY_ID,
  FEED_MS,
  FEEDER_CAP,
  FERT_COST,
  FLOWER_BY_ID,
  GRID,
  HIVE_MS,
  ITEM,
  MAX_HEATER,
  MAX_HIVES,
  MAX_OVEN,
  MAX_PER_ANIMAL,
  MAX_POTS,
  MAX_SOIL,
  MAX_SPRINKLER,
  MAX_TRADE,
  PROD_BY_ID,
  WATER_MS,
} from "./config";
import {
  addItem,
  addXp,
  capCost,
  collectorCost,
  cookMul,
  feederCost,
  flowerMul,
  hasRecipe,
  heaterCost,
  hiveCost,
  isUnlocked,
  makeQuest,
  ovenCost,
  plotCost,
  potCost,
  price,
  soilCost,
  spaceLeft,
  sprinklerCost,
  stoveCost,
  takeItem,
  tradeCost,
} from "./economy";
import { itemName as name, tf } from "./i18n";
import { countAnimals, ensurePen, markDirty, save, state } from "./state";
import type { Agg } from "./types";
import { render, toast } from "./view";

/* ======================================================================
 *  ACTIONS
 * ==================================================================== */
export function handle(act: string, arg?: string): void {
  if (act === "open") {
    if (arg === "apiary" && !isUnlocked(APIARY_LVL)) {
      toast(tf("needLevel", { n: APIARY_LVL }));
      return;
    }
    state.tab = arg as string;
    markDirty();
    render();
    return;
  }
  if (act === "close") {
    state.tab = "village";
    markDirty();
    render();
    return;
  }
  if (act === "noop") return;

  if (act === "seed") {
    if (CROP_BY_ID[arg as string] && !isUnlocked(CROP_BY_ID[arg as string].lvl)) {
      toast(tf("needLevel", { n: CROP_BY_ID[arg as string].lvl }));
      return;
    }
    state.sel = arg as string;
    markDirty();
    render();
    return;
  }

  if (act === "plot") {
    const ag = freshAgg();
    if (actPlot(+(arg as string), ag)) {
      flushAgg(ag);
      save();
      render();
    } else flushAgg(ag);
    return;
  }

  if (act === "penlocked") {
    const ad = ANIMAL_BY_ID[arg as string];
    if (ad) toast(tf("needLevel", { n: ad.lvl }));
    return;
  }
  if (act === "openpen") {
    const pd = ANIMAL_BY_ID[arg as string];
    if (!pd) return;
    if (!isUnlocked(pd.lvl)) {
      toast(tf("needLevel", { n: pd.lvl }));
      return;
    }
    state.tab = "pen";
    state.penType = arg as string;
    markDirty();
    render();
    return;
  }

  if (act === "buyplot") {
    if (state.unlocked >= GRID) return;
    const pc = plotCost();
    if (state.coins < pc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= pc;
    state.unlocked++;
    save();
    render();
    return;
  }

  if (act === "buyanimal") {
    buyAnimal(arg as string);
    return;
  }
  if (act === "buyfeeder") {
    buyFeeder(arg as string);
    return;
  }
  if (act === "buycollector") {
    buyCollector(arg as string);
    return;
  }
  if (act === "loadfeed") {
    loadFeed(arg as string);
    return;
  }
  if (act === "collectall") {
    collectAll(arg as string);
    return;
  }

  if (act === "cook") {
    startCook(arg as string);
    return;
  }
  if (act === "collectcook") {
    collectCook(+(arg as string));
    return;
  }

  if (act === "plant") {
    startPlant(arg as string);
    return;
  }
  if (act === "collectpot") {
    collectPot(+(arg as string));
    return;
  }

  if (act === "collecthive") {
    collectHive(+(arg as string));
    return;
  }

  if (act === "sell") {
    sell(arg as string, 1);
    return;
  }
  if (act === "sellall") {
    sell(arg as string, state.inv[arg as string] || 0);
    return;
  }
  if (act === "upgrade") {
    upgrade(arg as string);
    return;
  }

  if (act === "quest") {
    deliver(+(arg as string));
    return;
  }
}

// ---- Hold-and-sweep actions -------------------------------------------
// Each act* mutates state for a single tile/animal and records what it did
// into `agg`, without touching the DOM. A whole sweep aggregates into one
// `agg`, then flushAgg() shows a single summary toast and we render once.
export function freshAgg(): Agg {
  return {
    harvest: {},
    collect: {},
    plant: 0,
    water: 0,
    clear: 0,
    fed: 0,
    fert: 0,
    full: false,
    needCoins: false,
    needLevel: 0,
  };
}

// Apply the selected tool to one field tile. Harvests ripe crops first
// (whatever the tool), otherwise plants / waters / clears. Returns true
// when something actually changed.
export function actPlot(i: number, agg: Agg): boolean {
  const p = state.plots[i];
  if (!p) return false;
  if (p.crop && p.grown >= CROP_BY_ID[p.crop].grow) {
    if (spaceLeft() < 1) {
      agg.full = true;
      return false;
    }
    const amt = Math.min(p.fert ? 2 : 1, spaceLeft());
    const c = CROP_BY_ID[p.crop];
    addItem(c.id, amt);
    addXp(c.xp);
    p.crop = null;
    p.grown = 0;
    p.water = 0;
    p.fert = false;
    agg.harvest[c.id] = (agg.harvest[c.id] || 0) + amt;
    markDirty();
    return true;
  }
  if (state.sel === "clear") {
    if (p.crop) {
      p.crop = null;
      p.grown = 0;
      p.water = 0;
      p.fert = false;
      agg.clear++;
      markDirty();
      return true;
    }
    return false;
  }
  if (state.sel === "water") {
    if (p.crop && p.water <= 0) {
      p.water = WATER_MS;
      agg.water++;
      markDirty();
      return true;
    }
    return false;
  }
  if (state.sel === "fert") {
    if (p.crop && !p.fert) {
      if (state.coins < FERT_COST) {
        agg.needCoins = true;
        return false;
      }
      state.coins -= FERT_COST;
      p.fert = true;
      agg.fert++;
      markDirty();
      return true;
    }
    return false;
  }
  if (!p.crop) {
    const crop = CROP_BY_ID[state.sel];
    if (!crop) return false;
    if (!isUnlocked(crop.lvl)) {
      agg.needLevel = crop.lvl;
      return false;
    }
    if (state.coins < crop.seed) {
      agg.needCoins = true;
      return false;
    }
    state.coins -= crop.seed;
    p.crop = crop.id;
    p.grown = 0;
    p.water = 0;
    agg.plant++;
    markDirty();
    return true;
  }
  return false;
}

// Tend one animal: collect its product if ready, else feed it if it's
// hungry and we have the feed crop. Returns true when something changed.
export function actAnimal(i: number, agg: Agg): boolean {
  const a = state.animals[i];
  if (!a) return false;
  const def = ANIMAL_BY_ID[a.type];
  if (a.grown >= def.interval) {
    if (spaceLeft() < 1) {
      agg.full = true;
      return false;
    }
    addItem(def.prod, 1);
    addXp(PROD_BY_ID[def.prod]?.xp || 0);
    a.grown = 0;
    agg.collect[def.prod] = (agg.collect[def.prod] || 0) + 1;
    markDirty();
    return true;
  }
  if (Date.now() >= a.feedUntil && (state.inv[def.feed] || 0) >= 1) {
    takeItem(def.feed, 1);
    a.feedUntil = Date.now() + FEED_MS;
    agg.fed++;
    markDirty();
    return true;
  }
  return false;
}

// Boil a finished sweep down to a single, language-light summary toast.
export function flushAgg(agg: Agg | null): void {
  if (!agg) return;
  const parts: string[] = [];
  let id: string;
  for (id in agg.harvest) parts.push(`+${agg.harvest[id]} ${ITEM[id].ico}`);
  for (id in agg.collect) parts.push(`+${agg.collect[id]} ${ITEM[id].ico}`);
  if (agg.plant) parts.push(`🌱×${agg.plant}`);
  if (agg.water) parts.push(`💧×${agg.water}`);
  if (agg.fert) parts.push(`💩×${agg.fert}`);
  if (agg.clear) parts.push(`🧺×${agg.clear}`);
  if (agg.fed) parts.push(`🍽️×${agg.fed}`);
  if (parts.length) {
    toast(parts.join("  "));
    return;
  }
  if (agg.full) {
    toast(MG.i18n.t("full"));
    return;
  }
  if (agg.needCoins) {
    toast(MG.i18n.t("needCoins"));
    return;
  }
  if (agg.needLevel) {
    toast(tf("needLevel", { n: agg.needLevel }));
    return;
  }
}

function buyAnimal(id: string): void {
  const def = ANIMAL_BY_ID[id];
  if (!def) return;
  if (!isUnlocked(def.lvl)) {
    toast(tf("needLevel", { n: def.lvl }));
    return;
  }
  if (countAnimals(id) >= MAX_PER_ANIMAL) {
    toast(tf("penFull", { n: MAX_PER_ANIMAL }));
    return;
  }
  if (state.coins < def.cost) {
    toast(MG.i18n.t("needCoins"));
    return;
  }
  state.coins -= def.cost;
  ensurePen(id);
  state.animals.push({ type: id, grown: 0, feedUntil: Date.now() + FEED_MS });
  toast(MG.i18n.t("bought"));
  save();
  render();
}
function buyFeeder(type: string): void {
  const def = ANIMAL_BY_ID[type];
  if (!def) return;
  const pen = ensurePen(type);
  if (pen.feeder) return;
  const cost = feederCost(type);
  if (state.coins < cost) {
    toast(MG.i18n.t("needCoins"));
    return;
  }
  state.coins -= cost;
  pen.feeder = true;
  toast(MG.i18n.t("bought"));
  save();
  render();
}
function buyCollector(type: string): void {
  const def = ANIMAL_BY_ID[type];
  if (!def) return;
  const pen = ensurePen(type);
  if (pen.collector) return;
  const cost = collectorCost(type);
  if (state.coins < cost) {
    toast(MG.i18n.t("needCoins"));
    return;
  }
  state.coins -= cost;
  pen.collector = true;
  toast(MG.i18n.t("bought"));
  save();
  render();
}
// Move feed crops from storage into a pen's feeder, up to its capacity.
function loadFeed(type: string): void {
  const def = ANIMAL_BY_ID[type];
  if (!def) return;
  const pen = ensurePen(type);
  if (!pen.feeder) return;
  const room = FEEDER_CAP - pen.feed;
  if (room <= 0) {
    toast(MG.i18n.t("feederFull"));
    return;
  }
  const have = state.inv[def.feed] || 0;
  const n = Math.min(room, have);
  if (n <= 0) {
    toast(MG.i18n.t("needIngredients"));
    return;
  }
  takeItem(def.feed, n);
  pen.feed += n;
  toast(`🍽️ ${ITEM[def.feed].ico} +${n}`);
  save();
  render();
}
// Gather everything ready in a building / pen in one tap.
function collectAll(kind: string): void {
  let n = 0;
  let hitFull = false;
  function take(itemId: string, xp?: number): boolean {
    if (spaceLeft() < 1) {
      hitFull = true;
      return false;
    }
    addItem(itemId, 1);
    addXp(xp || 0);
    n++;
    return true;
  }
  if (kind === "cook") {
    state.cooks.forEach((c, i) => {
      if (c && Date.now() >= c.endsAt && take(c.dish, DISH_BY_ID[c.dish].xp)) state.cooks[i] = null;
    });
  } else if (kind === "pot") {
    state.pots.forEach((p, i) => {
      if (p && Date.now() >= p.endsAt && take(p.flower, FLOWER_BY_ID[p.flower].xp))
        state.pots[i] = null;
    });
  } else if (kind === "hive") {
    state.hives.forEach((hv) => {
      if (hv.grown >= HIVE_MS && take("honey", PROD_BY_ID.honey?.xp)) hv.grown = 0;
    });
  } else if (kind === "pen") {
    const t = state.penType;
    const def = ANIMAL_BY_ID[t as string];
    if (def)
      state.animals.forEach((a) => {
        if (a.type === t && a.grown >= def.interval && take(def.prod, PROD_BY_ID[def.prod]?.xp))
          a.grown = 0;
      });
  }
  if (n) toast(`🧺 +${n}`);
  else if (hitFull) toast(MG.i18n.t("full"));
  save();
  render();
}

function startCook(id: string): void {
  const def = DISH_BY_ID[id];
  if (!def) return;
  if (!isUnlocked(def.lvl)) {
    toast(tf("needLevel", { n: def.lvl }));
    return;
  }
  let slot = -1;
  for (let i = 0; i < state.cooks.length; i++)
    if (!state.cooks[i]) {
      slot = i;
      break;
    }
  if (slot < 0) {
    toast(MG.i18n.t("freeStove"));
    return;
  }
  if (!hasRecipe(def.recipe)) {
    toast(MG.i18n.t("needIngredients"));
    return;
  }
  for (const k in def.recipe) takeItem(k, def.recipe[k]);
  const cdur = def.cook / cookMul();
  state.cooks[slot] = { dish: id, endsAt: Date.now() + cdur, total: cdur };
  toast(tf("cookStarted", { item: `${def.ico} ${name(id)}` }));
  save();
  render();
}
function collectCook(i: number): void {
  const c = state.cooks[i];
  if (!c) return;
  if (Date.now() < c.endsAt) return;
  if (spaceLeft() < 1) {
    toast(MG.i18n.t("full"));
    return;
  }
  const def = DISH_BY_ID[c.dish];
  addItem(c.dish, 1);
  addXp(def.xp);
  state.cooks[i] = null;
  toast(tf("collected", { n: 1, item: `${def.ico} ${name(c.dish)}` }));
  save();
  render();
}

function startPlant(id: string): void {
  const def = FLOWER_BY_ID[id];
  if (!def) return;
  if (!isUnlocked(def.lvl)) {
    toast(tf("needLevel", { n: def.lvl }));
    return;
  }
  let slot = -1;
  for (let i = 0; i < state.pots.length; i++)
    if (!state.pots[i]) {
      slot = i;
      break;
    }
  if (slot < 0) {
    toast(MG.i18n.t("noFreePot"));
    return;
  }
  if (state.coins < def.seed) {
    toast(MG.i18n.t("needCoins"));
    return;
  }
  state.coins -= def.seed;
  const fdur = def.grow / flowerMul();
  state.pots[slot] = { flower: id, endsAt: Date.now() + fdur, total: fdur };
  toast(`🌱 ${def.ico} ${name(id)}`);
  save();
  render();
}
function collectPot(i: number): void {
  const p = state.pots[i];
  if (!p) return;
  if (Date.now() < p.endsAt) return;
  if (spaceLeft() < 1) {
    toast(MG.i18n.t("full"));
    return;
  }
  const def = FLOWER_BY_ID[p.flower];
  addItem(p.flower, 1);
  addXp(def.xp);
  state.pots[i] = null;
  toast(tf("collected", { n: 1, item: `${def.ico} ${name(p.flower)}` }));
  save();
  render();
}

function collectHive(i: number): void {
  const hv = state.hives[i];
  if (!hv) return;
  if (hv.grown < HIVE_MS) return;
  if (spaceLeft() < 1) {
    toast(MG.i18n.t("full"));
    return;
  }
  addItem("honey", 1);
  addXp(PROD_BY_ID.honey?.xp || 0);
  hv.grown = 0;
  toast(tf("collected", { n: 1, item: `${ITEM.honey.ico} ${name("honey")}` }));
  save();
  render();
}

function sell(id: string, n: number): void {
  n = Math.min(n, state.inv[id] || 0);
  if (n <= 0) return;
  const gain = price(id) * n;
  takeItem(id, n);
  state.coins += gain;
  toast(tf("gotCoins", { n: gain }));
  save();
  render();
}
function upgrade(id: string): void {
  if (id === "cap") {
    const cc = capCost();
    if (state.coins < cc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= cc;
    state.cap += 20;
  } else if (id === "stove") {
    const sc = stoveCost();
    if (state.coins < sc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= sc;
    state.stoves += 1;
    state.cooks.push(null);
  } else if (id === "pot") {
    if (state.potCap >= MAX_POTS) return;
    const pc = potCost();
    if (state.coins < pc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= pc;
    state.potCap += 1;
    state.pots.push(null);
  } else if (id === "soil") {
    if (state.soil >= MAX_SOIL) return;
    const soc = soilCost();
    if (state.coins < soc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= soc;
    state.soil += 1;
  } else if (id === "sprinkler") {
    if (state.sprinkler >= MAX_SPRINKLER) return;
    const spc = sprinklerCost();
    if (state.coins < spc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= spc;
    state.sprinkler += 1;
  } else if (id === "hive") {
    if (state.hives.length >= MAX_HIVES) return;
    const hc = hiveCost();
    if (state.coins < hc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= hc;
    state.hives.push({ grown: 0 });
  } else if (id === "oven") {
    if (state.oven >= MAX_OVEN) return;
    const oc = ovenCost();
    if (state.coins < oc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= oc;
    state.oven += 1;
  } else if (id === "heater") {
    if (state.heater >= MAX_HEATER) return;
    const htc = heaterCost();
    if (state.coins < htc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= htc;
    state.heater += 1;
  } else if (id === "trade") {
    if (state.trade >= MAX_TRADE) return;
    const trc = tradeCost();
    if (state.coins < trc) {
      toast(MG.i18n.t("needCoins"));
      return;
    }
    state.coins -= trc;
    state.trade += 1;
  }
  save();
  render();
}

function deliver(i: number): void {
  const q = state.quests[i];
  if (!q) return;
  if ((state.inv[q.item] || 0) < q.need) return;
  takeItem(q.item, q.need);
  state.coins += q.coins;
  addXp(q.xp);
  toast(tf("questDone", { c: q.coins, x: q.xp }));
  state.quests[i] = makeQuest(state);
  save();
  render();
}

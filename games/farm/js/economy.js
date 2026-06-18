/* ============================================================================
 *  Farm — economy & progression rules.
 *
 *  Pure-ish domain logic that operates on the live game state: the inventory,
 *  market pricing, XP / levelling, the upgrade-cost curves, the multipliers
 *  the various upgrades apply, and order (quest) generation. Nothing here
 *  touches the DOM directly (besides updating header stats / toasts when you
 *  level up).
 * ========================================================================== */
(function (Farm) {
  "use strict";

  // Static content (config.js has already run).
  var ITEM = Farm.ITEM,
      CROPS = Farm.CROPS, FLOWERS = Farm.FLOWERS, ANIMALS = Farm.ANIMALS, DISHES = Farm.DISHES,
      CROP_BY_ID = Farm.CROP_BY_ID, FLOWER_BY_ID = Farm.FLOWER_BY_ID,
      DISH_BY_ID = Farm.DISH_BY_ID, ANIMAL_BY_ID = Farm.ANIMAL_BY_ID,
      ANIMAL_FOR_PROD = Farm.ANIMAL_FOR_PROD;
  var APIARY_LVL = Farm.APIARY_LVL, MARKET_MS = Farm.MARKET_MS,
      SOIL_STEP = Farm.SOIL_STEP, OVEN_STEP = Farm.OVEN_STEP,
      HEATER_STEP = Farm.HEATER_STEP, TRADE_STEP = Farm.TRADE_STEP,
      START_PLOTS = Farm.START_PLOTS, START_POTS = Farm.START_POTS;

  // Live state + cross-module helpers, bound once at boot.
  var state, ui, toast, tf, need;
  Farm.ready(function () {
    state = Farm.state;
    ui = Farm.ui;
    toast = Farm.toast;
    tf = Farm.tf;
    need = Farm.need;
  });

  /* ---- Upgrade multipliers (depend on current upgrade levels) ---- */
  // Sprinkler waters every dry, growing plot on this cadence; higher levels
  // run it more often.
  function sprinkleEvery() { return Math.max(7000, 30000 - (state.sprinkler - 1) * 6000); }
  function soilMul() { return 1 + (state.soil || 0) * SOIL_STEP; }
  function cookMul() { return 1 + (state.oven || 0) * OVEN_STEP; }     // divides cook time
  function flowerMul() { return 1 + (state.heater || 0) * HEATER_STEP; } // divides grow time
  function tradeMul() { return 1 + (state.trade || 0) * TRADE_STEP; }    // scales sell price

  /* ---- Inventory ---- */
  function invCount() { var n = 0; for (var k in state.inv) n += state.inv[k]; return n; }
  function spaceLeft() { return state.cap - invCount(); }
  function addItem(id, n) { state.inv[id] = (state.inv[id] || 0) + n; }
  function takeItem(id, n) {
    var have = state.inv[id] || 0;
    if (have <= n) delete state.inv[id]; else state.inv[id] = have - n;
  }
  function hasRecipe(rec) { for (var k in rec) if ((state.inv[k] || 0) < rec[k]) return false; return true; }
  function held(id) { return state.inv[id] || 0; }

  // A small chip showing how much of an item is currently in storage.
  function stk(id) {
    var n = held(id);
    return '<span class="stk' + (n ? "" : " zero") + '">📦 ' + n + "</span>";
  }

  /* ---- Unlocks ---- */
  function isUnlocked(lvl, st) { return (st || state).level >= lvl; }
  function itemUnlocked(id, st) {
    if (CROP_BY_ID[id]) return isUnlocked(CROP_BY_ID[id].lvl, st);
    if (FLOWER_BY_ID[id]) return isUnlocked(FLOWER_BY_ID[id].lvl, st);
    if (DISH_BY_ID[id]) return isUnlocked(DISH_BY_ID[id].lvl, st);
    if (ANIMAL_FOR_PROD[id]) return isUnlocked(ANIMAL_FOR_PROD[id].lvl, st);
    if (id === "honey") return isUnlocked(APIARY_LVL, st);
    return true;
  }

  /* ---- Market pricing ---- */
  function price(id) {
    var base = ITEM[id] ? ITEM[id].sell : 0;
    var m = state.prices[id] || 1;
    return Math.max(1, Math.round(base * m * tradeMul()));
  }

  function rollMarket(s, force) {
    if (!force && s.marketUntil && Date.now() < s.marketUntil) return;
    s.prices = {};
    for (var id in ITEM) s.prices[id] = 0.75 + Math.random() * 0.6; // 0.75 – 1.35
    s.marketUntil = Date.now() + MARKET_MS;
  }

  /* ---- XP / levelling ---- */
  function addXp(n) {
    state.xp += n;
    var leveled = false, last;
    while (state.xp >= need(state.level)) {
      state.xp -= need(state.level);
      state.level++;
      leveled = true;
      last = state.level;
      var bonus = state.level * 12;
      state.coins += bonus;
      toast(tf("levelUp", { n: state.level, c: bonus }));
    }
    if (leveled) {
      var un = unlocksAt(last);
      if (un) setTimeout(function () { toast(MG.i18n.t("unlocked") + " " + un); }, 900);
      ui.setStat("level", state.level);
      ui.stat("level").classList.add("mg-flash");
      setTimeout(function () { ui.stat("level").classList.remove("mg-flash"); }, 400);
    }
  }

  function unlocksAt(level) {
    var out = [];
    CROPS.forEach(function (c) { if (c.lvl === level) out.push(c.ico); });
    FLOWERS.forEach(function (f) { if (f.lvl === level) out.push(f.ico); });
    ANIMALS.forEach(function (a) { if (a.lvl === level) out.push(a.ico); });
    DISHES.forEach(function (d) { if (d.lvl === level) out.push(d.ico); });
    if (level === APIARY_LVL) out.push("🐝");
    return out.join(" ");
  }

  /* ---- Orders / quests ---- */
  function deliverablePool(st) {
    var ids = [];
    for (var id in ITEM) if (itemUnlocked(id, st)) ids.push(id);
    return ids;
  }
  function makeQuest(s) {
    var pool = deliverablePool(s);
    var taken = {};
    (s.quests || []).forEach(function (q) { if (q) taken[q.item] = true; });
    var fresh = pool.filter(function (id) { return !taken[id]; });
    if (fresh.length) pool = fresh;
    var item = pool[Math.floor(Math.random() * pool.length)] || "wheat";
    var base = ITEM[item].sell;
    var maxN = base > 60 ? 2 : 3;
    var n = 1 + Math.floor(Math.random() * maxN);
    var coins = Math.round(base * n * 1.7) + s.level * 4;
    var xp = Math.max(3, Math.round(base / 4)) * n;
    return { item: item, need: n, coins: coins, xp: xp };
  }

  /* ---- Upgrade / purchase cost curves ---- */
  function feederCost(type) { return Math.round(ANIMAL_BY_ID[type].cost * 1.4); }
  function collectorCost(type) { return Math.round(ANIMAL_BY_ID[type].cost * 1.8); }
  function plotCost() { return 40 + (state.unlocked - START_PLOTS) * 40; }
  function potCost() { return 70 + (state.potCap - START_POTS) * 90; }
  function hiveCost() { return 90 + state.hives.length * 120; }
  function capCost() { return Math.round(state.cap * 0.9); }
  function stoveCost() { return 90 + (state.stoves - 1) * 110; }
  function soilCost() { return 80 + state.soil * 130; }
  function sprinklerCost() { return 120 + state.sprinkler * 170; }
  function ovenCost() { return 130 + state.oven * 150; }
  function heaterCost() { return 130 + state.heater * 150; }
  function tradeCost() { return 160 + state.trade * 180; }

  // ---- Expose ----
  Farm.sprinkleEvery = sprinkleEvery;
  Farm.soilMul = soilMul;
  Farm.cookMul = cookMul;
  Farm.flowerMul = flowerMul;
  Farm.tradeMul = tradeMul;
  Farm.invCount = invCount;
  Farm.spaceLeft = spaceLeft;
  Farm.addItem = addItem;
  Farm.takeItem = takeItem;
  Farm.hasRecipe = hasRecipe;
  Farm.held = held;
  Farm.stk = stk;
  Farm.isUnlocked = isUnlocked;
  Farm.itemUnlocked = itemUnlocked;
  Farm.price = price;
  Farm.rollMarket = rollMarket;
  Farm.addXp = addXp;
  Farm.unlocksAt = unlocksAt;
  Farm.deliverablePool = deliverablePool;
  Farm.makeQuest = makeQuest;
  Farm.feederCost = feederCost;
  Farm.collectorCost = collectorCost;
  Farm.plotCost = plotCost;
  Farm.potCost = potCost;
  Farm.hiveCost = hiveCost;
  Farm.capCost = capCost;
  Farm.stoveCost = stoveCost;
  Farm.soilCost = soilCost;
  Farm.sprinklerCost = sprinklerCost;
  Farm.ovenCost = ovenCost;
  Farm.heaterCost = heaterCost;
  Farm.tradeCost = tradeCost;
})(window.Farm);

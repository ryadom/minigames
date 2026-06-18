/* ============================================================================
 *  Farm — actions (the command layer).
 *
 *  Every player intent funnels through `handle(act, arg)`, which dispatches to
 *  the small action functions below. These mutate state, persist, re-render
 *  and toast. The hold-and-sweep gestures (field / pens) use the `act*` +
 *  `agg` helpers so a whole sweep aggregates into one summary toast and a
 *  single render — those are driven by the input controller.
 * ========================================================================== */
(function (Farm) {
  "use strict";

  // Static content & constants.
  var ITEM = Farm.ITEM, CROP_BY_ID = Farm.CROP_BY_ID, ANIMAL_BY_ID = Farm.ANIMAL_BY_ID,
      DISH_BY_ID = Farm.DISH_BY_ID, FLOWER_BY_ID = Farm.FLOWER_BY_ID, PROD_BY_ID = Farm.PROD_BY_ID;
  var FERT_COST = Farm.FERT_COST, WATER_MS = Farm.WATER_MS, FEED_MS = Farm.FEED_MS,
      MAX_PER_ANIMAL = Farm.MAX_PER_ANIMAL, GRID = Farm.GRID, FEEDER_CAP = Farm.FEEDER_CAP,
      HIVE_MS = Farm.HIVE_MS, APIARY_LVL = Farm.APIARY_LVL, MAX_POTS = Farm.MAX_POTS,
      MAX_SOIL = Farm.MAX_SOIL, MAX_SPRINKLER = Farm.MAX_SPRINKLER, MAX_OVEN = Farm.MAX_OVEN,
      MAX_HEATER = Farm.MAX_HEATER, MAX_TRADE = Farm.MAX_TRADE, MAX_HIVES = Farm.MAX_HIVES;
  // i18n.
  var name = Farm.itemName, tf = Farm.tf;
  // Economy.
  var addItem = Farm.addItem, takeItem = Farm.takeItem, addXp = Farm.addXp, spaceLeft = Farm.spaceLeft,
      hasRecipe = Farm.hasRecipe, price = Farm.price, isUnlocked = Farm.isUnlocked, makeQuest = Farm.makeQuest,
      feederCost = Farm.feederCost, collectorCost = Farm.collectorCost, plotCost = Farm.plotCost,
      potCost = Farm.potCost, hiveCost = Farm.hiveCost, capCost = Farm.capCost, stoveCost = Farm.stoveCost,
      soilCost = Farm.soilCost, sprinklerCost = Farm.sprinklerCost, ovenCost = Farm.ovenCost,
      heaterCost = Farm.heaterCost, tradeCost = Farm.tradeCost, cookMul = Farm.cookMul, flowerMul = Farm.flowerMul;
  // State helpers + view (defined in files loaded before this one).
  var ensurePen = Farm.ensurePen, countAnimals = Farm.countAnimals, markDirty = Farm.markDirty, save = Farm.save;
  var render = Farm.render, toast = Farm.toast, patch = Farm.patch, syncStats = Farm.syncStats,
      updateAnimCell = Farm.updateAnimCell;

  // Live state, bound at boot.
  var state;
  Farm.ready(function () { state = Farm.state; });

  /* ======================================================================
   *  ACTIONS
   * ==================================================================== */
  function handle(act, arg) {
    if (act === "open") {
      if (arg === "apiary" && !isUnlocked(APIARY_LVL)) { toast(tf("needLevel", { n: APIARY_LVL })); return; }
      state.tab = arg; markDirty(); render(); return;
    }
    if (act === "close") { state.tab = "village"; markDirty(); render(); return; }
    if (act === "noop") return;

    if (act === "seed") {
      if (CROP_BY_ID[arg] && !isUnlocked(CROP_BY_ID[arg].lvl)) { toast(tf("needLevel", { n: CROP_BY_ID[arg].lvl })); return; }
      state.sel = arg; markDirty(); render(); return;
    }

    if (act === "plot") {
      var ag = freshAgg();
      if (actPlot(+arg, ag)) { flushAgg(ag); save(); render(); }
      else flushAgg(ag);
      return;
    }

    if (act === "penlocked") {
      var ad = ANIMAL_BY_ID[arg];
      if (ad) toast(tf("needLevel", { n: ad.lvl }));
      return;
    }
    if (act === "openpen") {
      var pd = ANIMAL_BY_ID[arg];
      if (!pd) return;
      if (!isUnlocked(pd.lvl)) { toast(tf("needLevel", { n: pd.lvl })); return; }
      state.tab = "pen"; state.penType = arg; markDirty(); render(); return;
    }

    if (act === "buyplot") {
      if (state.unlocked >= GRID) return;
      var pc = plotCost();
      if (state.coins < pc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= pc; state.unlocked++; save(); render(); return;
    }

    if (act === "buyanimal") { buyAnimal(arg); return; }
    if (act === "buyfeeder") { buyFeeder(arg); return; }
    if (act === "buycollector") { buyCollector(arg); return; }
    if (act === "loadfeed") { loadFeed(arg); return; }
    if (act === "collectall") { collectAll(arg); return; }

    if (act === "cook") { startCook(arg); return; }
    if (act === "collectcook") { collectCook(+arg); return; }

    if (act === "plant") { startPlant(arg); return; }
    if (act === "collectpot") { collectPot(+arg); return; }

    if (act === "collecthive") { collectHive(+arg); return; }

    if (act === "sell") { sell(arg, 1); return; }
    if (act === "sellall") { sell(arg, state.inv[arg] || 0); return; }
    if (act === "upgrade") { upgrade(arg); return; }

    if (act === "quest") { deliver(+arg); return; }
  }

  // ---- Hold-and-sweep actions -------------------------------------------
  // Each act* mutates state for a single tile/animal and records what it did
  // into `agg`, without touching the DOM. A whole sweep aggregates into one
  // `agg`, then flushAgg() shows a single summary toast and we render once.
  function freshAgg() {
    return { harvest: {}, collect: {}, plant: 0, water: 0, clear: 0, fed: 0, fert: 0,
             full: false, needCoins: false, needLevel: 0 };
  }

  // Apply the selected tool to one field tile. Harvests ripe crops first
  // (whatever the tool), otherwise plants / waters / clears. Returns true
  // when something actually changed.
  function actPlot(i, agg) {
    var p = state.plots[i];
    if (!p) return false;
    if (p.crop && p.grown >= CROP_BY_ID[p.crop].grow) {
      if (spaceLeft() < 1) { agg.full = true; return false; }
      var amt = Math.min(p.fert ? 2 : 1, spaceLeft());
      var c = CROP_BY_ID[p.crop];
      addItem(c.id, amt);
      addXp(c.xp);
      p.crop = null; p.grown = 0; p.water = 0; p.fert = false;
      agg.harvest[c.id] = (agg.harvest[c.id] || 0) + amt;
      markDirty(); return true;
    }
    if (state.sel === "clear") {
      if (p.crop) { p.crop = null; p.grown = 0; p.water = 0; p.fert = false; agg.clear++; markDirty(); return true; }
      return false;
    }
    if (state.sel === "water") {
      if (p.crop && p.water <= 0) { p.water = WATER_MS; agg.water++; markDirty(); return true; }
      return false;
    }
    if (state.sel === "fert") {
      if (p.crop && !p.fert) {
        if (state.coins < FERT_COST) { agg.needCoins = true; return false; }
        state.coins -= FERT_COST; p.fert = true; agg.fert++; markDirty(); return true;
      }
      return false;
    }
    if (!p.crop) {
      var crop = CROP_BY_ID[state.sel];
      if (!crop) return false;
      if (!isUnlocked(crop.lvl)) { agg.needLevel = crop.lvl; return false; }
      if (state.coins < crop.seed) { agg.needCoins = true; return false; }
      state.coins -= crop.seed;
      p.crop = crop.id; p.grown = 0; p.water = 0;
      agg.plant++; markDirty(); return true;
    }
    return false;
  }

  // Tend one animal: collect its product if ready, else feed it if it's
  // hungry and we have the feed crop. Returns true when something changed.
  function actAnimal(i, agg) {
    var a = state.animals[i]; if (!a) return false;
    var def = ANIMAL_BY_ID[a.type];
    if (a.grown >= def.interval) {
      if (spaceLeft() < 1) { agg.full = true; return false; }
      addItem(def.prod, 1);
      addXp((PROD_BY_ID[def.prod] || {}).xp || 0);
      a.grown = 0;
      agg.collect[def.prod] = (agg.collect[def.prod] || 0) + 1;
      markDirty(); return true;
    }
    if (Date.now() >= a.feedUntil && (state.inv[def.feed] || 0) >= 1) {
      takeItem(def.feed, 1);
      a.feedUntil = Date.now() + FEED_MS;
      agg.fed++;
      markDirty(); return true;
    }
    return false;
  }

  // Boil a finished sweep down to a single, language-light summary toast.
  function flushAgg(agg) {
    if (!agg) return;
    var parts = [], id;
    for (id in agg.harvest) parts.push("+" + agg.harvest[id] + " " + ITEM[id].ico);
    for (id in agg.collect) parts.push("+" + agg.collect[id] + " " + ITEM[id].ico);
    if (agg.plant) parts.push("🌱×" + agg.plant);
    if (agg.water) parts.push("💧×" + agg.water);
    if (agg.fert) parts.push("💩×" + agg.fert);
    if (agg.clear) parts.push("🧺×" + agg.clear);
    if (agg.fed) parts.push("🍽️×" + agg.fed);
    if (parts.length) { toast(parts.join("  ")); return; }
    if (agg.full) { toast(MG.i18n.t("full")); return; }
    if (agg.needCoins) { toast(MG.i18n.t("needCoins")); return; }
    if (agg.needLevel) { toast(tf("needLevel", { n: agg.needLevel })); return; }
  }

  function buyAnimal(id) {
    var def = ANIMAL_BY_ID[id]; if (!def) return;
    if (!isUnlocked(def.lvl)) { toast(tf("needLevel", { n: def.lvl })); return; }
    if (countAnimals(id) >= MAX_PER_ANIMAL) { toast(tf("penFull", { n: MAX_PER_ANIMAL })); return; }
    if (state.coins < def.cost) { toast(MG.i18n.t("needCoins")); return; }
    state.coins -= def.cost;
    ensurePen(id);
    state.animals.push({ type: id, grown: 0, feedUntil: Date.now() + FEED_MS });
    toast(MG.i18n.t("bought"));
    save(); render();
  }
  function buyFeeder(type) {
    var def = ANIMAL_BY_ID[type]; if (!def) return;
    var pen = ensurePen(type);
    if (pen.feeder) return;
    var cost = feederCost(type);
    if (state.coins < cost) { toast(MG.i18n.t("needCoins")); return; }
    state.coins -= cost; pen.feeder = true;
    toast(MG.i18n.t("bought")); save(); render();
  }
  function buyCollector(type) {
    var def = ANIMAL_BY_ID[type]; if (!def) return;
    var pen = ensurePen(type);
    if (pen.collector) return;
    var cost = collectorCost(type);
    if (state.coins < cost) { toast(MG.i18n.t("needCoins")); return; }
    state.coins -= cost; pen.collector = true;
    toast(MG.i18n.t("bought")); save(); render();
  }
  // Move feed crops from storage into a pen's feeder, up to its capacity.
  function loadFeed(type) {
    var def = ANIMAL_BY_ID[type]; if (!def) return;
    var pen = ensurePen(type);
    if (!pen.feeder) return;
    var room = FEEDER_CAP - pen.feed;
    if (room <= 0) { toast(MG.i18n.t("feederFull")); return; }
    var have = state.inv[def.feed] || 0;
    var n = Math.min(room, have);
    if (n <= 0) { toast(MG.i18n.t("needIngredients")); return; }
    takeItem(def.feed, n); pen.feed += n;
    toast("🍽️ " + ITEM[def.feed].ico + " +" + n);
    save(); render();
  }
  // Gather everything ready in a building / pen in one tap.
  function collectAll(kind) {
    var n = 0, hitFull = false;
    function take(itemId, xp) {
      if (spaceLeft() < 1) { hitFull = true; return false; }
      addItem(itemId, 1); addXp(xp || 0); n++; return true;
    }
    if (kind === "cook") {
      state.cooks.forEach(function (c, i) {
        if (c && Date.now() >= c.endsAt && take(c.dish, DISH_BY_ID[c.dish].xp)) state.cooks[i] = null;
      });
    } else if (kind === "pot") {
      state.pots.forEach(function (p, i) {
        if (p && Date.now() >= p.endsAt && take(p.flower, FLOWER_BY_ID[p.flower].xp)) state.pots[i] = null;
      });
    } else if (kind === "hive") {
      state.hives.forEach(function (hv) {
        if (hv.grown >= HIVE_MS && take("honey", (PROD_BY_ID.honey || {}).xp)) hv.grown = 0;
      });
    } else if (kind === "pen") {
      var t = state.penType, def = ANIMAL_BY_ID[t];
      if (def) state.animals.forEach(function (a) {
        if (a.type === t && a.grown >= def.interval && take(def.prod, (PROD_BY_ID[def.prod] || {}).xp)) a.grown = 0;
      });
    }
    if (n) toast("🧺 +" + n);
    else if (hitFull) toast(MG.i18n.t("full"));
    save(); render();
  }

  function startCook(id) {
    var def = DISH_BY_ID[id]; if (!def) return;
    if (!isUnlocked(def.lvl)) { toast(tf("needLevel", { n: def.lvl })); return; }
    var slot = -1;
    for (var i = 0; i < state.cooks.length; i++) if (!state.cooks[i]) { slot = i; break; }
    if (slot < 0) { toast(MG.i18n.t("freeStove")); return; }
    if (!hasRecipe(def.recipe)) { toast(MG.i18n.t("needIngredients")); return; }
    for (var k in def.recipe) takeItem(k, def.recipe[k]);
    var cdur = def.cook / cookMul();
    state.cooks[slot] = { dish: id, endsAt: Date.now() + cdur, total: cdur };
    toast(tf("cookStarted", { item: def.ico + " " + name(id) }));
    save(); render();
  }
  function collectCook(i) {
    var c = state.cooks[i]; if (!c) return;
    if (Date.now() < c.endsAt) return;
    if (spaceLeft() < 1) { toast(MG.i18n.t("full")); return; }
    var def = DISH_BY_ID[c.dish];
    addItem(c.dish, 1);
    addXp(def.xp);
    state.cooks[i] = null;
    toast(tf("collected", { n: 1, item: def.ico + " " + name(c.dish) }));
    save(); render();
  }

  function startPlant(id) {
    var def = FLOWER_BY_ID[id]; if (!def) return;
    if (!isUnlocked(def.lvl)) { toast(tf("needLevel", { n: def.lvl })); return; }
    var slot = -1;
    for (var i = 0; i < state.pots.length; i++) if (!state.pots[i]) { slot = i; break; }
    if (slot < 0) { toast(MG.i18n.t("noFreePot")); return; }
    if (state.coins < def.seed) { toast(MG.i18n.t("needCoins")); return; }
    state.coins -= def.seed;
    var fdur = def.grow / flowerMul();
    state.pots[slot] = { flower: id, endsAt: Date.now() + fdur, total: fdur };
    toast("🌱 " + def.ico + " " + name(id));
    save(); render();
  }
  function collectPot(i) {
    var p = state.pots[i]; if (!p) return;
    if (Date.now() < p.endsAt) return;
    if (spaceLeft() < 1) { toast(MG.i18n.t("full")); return; }
    var def = FLOWER_BY_ID[p.flower];
    addItem(p.flower, 1);
    addXp(def.xp);
    state.pots[i] = null;
    toast(tf("collected", { n: 1, item: def.ico + " " + name(p.flower) }));
    save(); render();
  }

  function collectHive(i) {
    var hv = state.hives[i]; if (!hv) return;
    if (hv.grown < HIVE_MS) return;
    if (spaceLeft() < 1) { toast(MG.i18n.t("full")); return; }
    addItem("honey", 1);
    addXp((PROD_BY_ID.honey || {}).xp || 0);
    hv.grown = 0;
    toast(tf("collected", { n: 1, item: ITEM.honey.ico + " " + name("honey") }));
    save(); render();
  }

  function sell(id, n) {
    n = Math.min(n, state.inv[id] || 0);
    if (n <= 0) return;
    var gain = price(id) * n;
    takeItem(id, n);
    state.coins += gain;
    toast(tf("gotCoins", { n: gain }));
    save(); render();
  }
  function upgrade(id) {
    if (id === "cap") {
      var cc = capCost(); if (state.coins < cc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= cc; state.cap += 20;
    } else if (id === "stove") {
      var sc = stoveCost(); if (state.coins < sc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= sc; state.stoves += 1; state.cooks.push(null);
    } else if (id === "pot") {
      if (state.potCap >= MAX_POTS) return;
      var pc = potCost(); if (state.coins < pc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= pc; state.potCap += 1; state.pots.push(null);
    } else if (id === "soil") {
      if (state.soil >= MAX_SOIL) return;
      var soc = soilCost(); if (state.coins < soc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= soc; state.soil += 1;
    } else if (id === "sprinkler") {
      if (state.sprinkler >= MAX_SPRINKLER) return;
      var spc = sprinklerCost(); if (state.coins < spc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= spc; state.sprinkler += 1;
    } else if (id === "hive") {
      if (state.hives.length >= MAX_HIVES) return;
      var hc = hiveCost(); if (state.coins < hc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= hc; state.hives.push({ grown: 0 });
    } else if (id === "oven") {
      if (state.oven >= MAX_OVEN) return;
      var oc = ovenCost(); if (state.coins < oc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= oc; state.oven += 1;
    } else if (id === "heater") {
      if (state.heater >= MAX_HEATER) return;
      var htc = heaterCost(); if (state.coins < htc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= htc; state.heater += 1;
    } else if (id === "trade") {
      if (state.trade >= MAX_TRADE) return;
      var trc = tradeCost(); if (state.coins < trc) { toast(MG.i18n.t("needCoins")); return; }
      state.coins -= trc; state.trade += 1;
    }
    save(); render();
  }

  function deliver(i) {
    var q = state.quests[i]; if (!q) return;
    if ((state.inv[q.item] || 0) < q.need) return;
    takeItem(q.item, q.need);
    state.coins += q.coins;
    addXp(q.xp);
    toast(tf("questDone", { c: q.coins, x: q.xp }));
    state.quests[i] = makeQuest(state);
    save(); render();
  }

  // ---- Expose (handle + the sweep helpers used by the input controller) ----
  Farm.handle = handle;
  Farm.freshAgg = freshAgg;
  Farm.actPlot = actPlot;
  Farm.actAnimal = actAnimal;
  Farm.flushAgg = flushAgg;
})(window.Farm);

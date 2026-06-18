/* ============================================================================
 *  Farm — game state & persistence.
 *
 *  Owns the single canonical `state` object and the versioned save store.
 *  The state object is created once and always *mutated in place* (never
 *  reassigned), so every other module can bind a stable reference to it at
 *  boot. `load()` rebuilds it from a save (with offline-progress catch-up and
 *  defensive validation); `reset()` returns it to a fresh farm.
 * ========================================================================== */
(function (Farm) {
  "use strict";

  var GRID = Farm.GRID, START_PLOTS = Farm.START_PLOTS, START_POTS = Farm.START_POTS,
      MAX_POTS = Farm.MAX_POTS, MAX_SOIL = Farm.MAX_SOIL, MAX_SPRINKLER = Farm.MAX_SPRINKLER,
      MAX_OVEN = Farm.MAX_OVEN, MAX_HEATER = Farm.MAX_HEATER, MAX_TRADE = Farm.MAX_TRADE,
      MAX_PER_ANIMAL = Farm.MAX_PER_ANIMAL, FEEDER_CAP = Farm.FEEDER_CAP, FEED_MS = Farm.FEED_MS,
      MAX_HIVES = Farm.MAX_HIVES, HIVE_MS = Farm.HIVE_MS;
  var ITEM = Farm.ITEM, ANIMALS = Farm.ANIMALS,
      CROP_BY_ID = Farm.CROP_BY_ID, FLOWER_BY_ID = Farm.FLOWER_BY_ID,
      DISH_BY_ID = Farm.DISH_BY_ID, ANIMAL_BY_ID = Farm.ANIMAL_BY_ID;

  // Cross-module helpers (economy), bound at boot.
  var rollMarket, makeQuest, soilMul;
  Farm.ready(function () {
    rollMarket = Farm.rollMarket;
    makeQuest = Farm.makeQuest;
    soilMul = Farm.soilMul;
  });

  var store = MG.storage("farm", {
    version: 5,
    migrations: {
      2: function (d) { return { coins: (d && d.coins) || 25 }; },
      // 2 → 3: greenhouse, fertiliser and the soil/sprinkler upgrades arrive.
      // Defaults are filled in by load(), so the old save passes through.
      3: function (d) { return d || {}; },
      // 3 → 4: apiary (honey), workshop upgrades and the new crops/dishes
      // arrive. load() fills the new defaults, so the old save passes through.
      4: function (d) { return d || {}; },
      // 4 → 5: the barn is gone — animals live in per-type pens (up to 9 each)
      // with optional feeders/collectors. The old global barnCap is dropped;
      // load() fills the new per-pen defaults, so the old save passes through.
      5: function (d) { return d || {}; }
    }
  });

  // The canonical state object — created once, mutated in place.
  var state = {};
  Farm.state = state;

  // Copy all of `src`'s own properties into `target`, clearing the rest.
  // Lets us refresh the canonical state without breaking held references.
  function assignInto(target, src) {
    var k;
    for (k in target) if (target.hasOwnProperty(k)) delete target[k];
    for (k in src) if (src.hasOwnProperty(k)) target[k] = src[k];
  }

  var dirty = false;
  function markDirty() { dirty = true; }
  function isDirty() { return dirty; }

  function need(level) { return 60 + (level - 1) * 50; } // XP to reach next level

  // Per-pen state: an optional feeder (auto-feeds from a loaded food stock)
  // and an optional collector (auto-gathers produce into storage).
  function freshPens() {
    var o = {};
    ANIMALS.forEach(function (a) { o[a.type] = { feeder: false, collector: false, feed: 0 }; });
    return o;
  }
  function ensurePen(type) {
    if (!state.pens[type]) state.pens[type] = { feeder: false, collector: false, feed: 0 };
    return state.pens[type];
  }
  function countAnimals(type) {
    var n = 0;
    for (var i = 0; i < state.animals.length; i++) if (state.animals[i].type === type) n++;
    return n;
  }

  function freshState() {
    var plots = [];
    for (var i = 0; i < GRID; i++) plots.push({ crop: null, grown: 0, water: 0, fert: false });
    var pots = [];
    for (var j = 0; j < START_POTS; j++) pots.push(null);
    var s = {
      coins: 25, xp: 0, level: 1, sel: "wheat",
      unlocked: START_PLOTS,
      plots: plots,
      inv: {},
      cap: 40,
      animals: [],
      pens: freshPens(),
      stoves: 1,
      cooks: [null],
      potCap: START_POTS,
      pots: pots,
      hives: [],
      soil: 0,
      sprinkler: 0,
      oven: 0,
      heater: 0,
      trade: 0,
      quests: [],
      prices: {}, marketUntil: 0,
      tab: "village",
      lastSeen: Date.now()
    };
    rollMarket(s, true);
    for (var q = 0; q < 3; q++) s.quests.push(makeQuest(s));
    return s;
  }

  function load() {
    assignInto(state, freshState());
    var d = store.load();
    if (d && typeof d === "object") {
      if (typeof d.coins === "number" && d.coins >= 0) state.coins = d.coins;
      if (typeof d.xp === "number" && d.xp >= 0) state.xp = d.xp;
      if (typeof d.level === "number" && d.level >= 1) state.level = d.level;
      if (typeof d.unlocked === "number") state.unlocked = Math.max(START_PLOTS, Math.min(GRID, d.unlocked));
      if (typeof d.cap === "number" && d.cap > 0) state.cap = d.cap;
      if (typeof d.stoves === "number" && d.stoves >= 1) state.stoves = d.stoves;
      if (typeof d.potCap === "number" && d.potCap >= START_POTS) state.potCap = Math.min(MAX_POTS, d.potCap);
      if (typeof d.soil === "number" && d.soil >= 0) state.soil = Math.min(MAX_SOIL, Math.floor(d.soil));
      if (typeof d.sprinkler === "number" && d.sprinkler >= 0) state.sprinkler = Math.min(MAX_SPRINKLER, Math.floor(d.sprinkler));
      if (typeof d.oven === "number" && d.oven >= 0) state.oven = Math.min(MAX_OVEN, Math.floor(d.oven));
      if (typeof d.heater === "number" && d.heater >= 0) state.heater = Math.min(MAX_HEATER, Math.floor(d.heater));
      if (typeof d.trade === "number" && d.trade >= 0) state.trade = Math.min(MAX_TRADE, Math.floor(d.trade));
      if (CROP_BY_ID[d.sel] || d.sel === "water" || d.sel === "clear" || d.sel === "fert") state.sel = d.sel;

      if (d.inv && typeof d.inv === "object") {
        state.inv = {};
        for (var k in d.inv) if (ITEM[k] && d.inv[k] > 0) state.inv[k] = Math.floor(d.inv[k]);
      }
      if (Array.isArray(d.plots)) {
        for (var i = 0; i < GRID; i++) {
          var p = d.plots[i] || {};
          var crop = CROP_BY_ID[p.crop] ? p.crop : null;
          state.plots[i] = {
            crop: crop,
            grown: crop ? Math.max(0, +p.grown || 0) : 0,
            water: crop ? Math.max(0, +p.water || 0) : 0,
            fert: crop ? !!p.fert : false
          };
        }
      }
      if (Array.isArray(d.animals)) {
        state.animals = [];
        var animCounts = {};
        d.animals.forEach(function (a) {
          if (a && ANIMAL_BY_ID[a.type]) {
            animCounts[a.type] = animCounts[a.type] || 0;
            if (animCounts[a.type] >= MAX_PER_ANIMAL) return;
            animCounts[a.type]++;
            state.animals.push({
              type: a.type,
              grown: Math.max(0, +a.grown || 0),
              feedUntil: Math.max(0, +a.feedUntil || 0)
            });
          }
        });
      }
      if (d.pens && typeof d.pens === "object") {
        ANIMALS.forEach(function (a) {
          var pd = d.pens[a.type];
          if (pd && typeof pd === "object") {
            state.pens[a.type] = {
              feeder: !!pd.feeder,
              collector: !!pd.collector,
              feed: Math.max(0, Math.min(FEEDER_CAP, Math.floor(+pd.feed || 0)))
            };
          }
        });
      }
      if (Array.isArray(d.cooks)) {
        state.cooks = [];
        for (var c = 0; c < state.stoves; c++) {
          var ck = d.cooks[c];
          if (ck && DISH_BY_ID[ck.dish]) state.cooks.push({ dish: ck.dish, endsAt: +ck.endsAt || 0, total: +ck.total || DISH_BY_ID[ck.dish].cook });
          else state.cooks.push(null);
        }
      } else {
        state.cooks = []; for (var c2 = 0; c2 < state.stoves; c2++) state.cooks.push(null);
      }
      state.pots = [];
      for (var pp = 0; pp < state.potCap; pp++) {
        var pt = Array.isArray(d.pots) ? d.pots[pp] : null;
        if (pt && FLOWER_BY_ID[pt.flower]) state.pots.push({ flower: pt.flower, endsAt: +pt.endsAt || 0, total: +pt.total || FLOWER_BY_ID[pt.flower].grow });
        else state.pots.push(null);
      }
      if (Array.isArray(d.hives)) {
        state.hives = [];
        d.hives.forEach(function (hv) {
          if (state.hives.length < MAX_HIVES) state.hives.push({ grown: Math.max(0, +(hv && hv.grown) || 0) });
        });
      }
      if (Array.isArray(d.quests) && d.quests.length) {
        state.quests = [];
        d.quests.forEach(function (q) {
          if (q && ITEM[q.item] && q.need > 0) state.quests.push(q);
        });
        while (state.quests.length < 3) state.quests.push(makeQuest(state));
      }
      // The village is the home screen; building panels are transient.
      state.tab = "village";
    }

    // Offline progress.
    var now = Date.now();
    var away = now - (+ (d && d.lastSeen) || now);
    if (away > 0) {
      var offMul = soilMul();
      state.plots.forEach(function (pl) {
        if (pl.crop) {
          var g = CROP_BY_ID[pl.crop].grow;
          pl.grown = Math.min(g, pl.grown + away * offMul); // no water bonus offline
          pl.water = 0;
        }
      });
      var seen = +(d && d.lastSeen) || now;
      state.animals.forEach(function (a) {
        var iv = ANIMAL_BY_ID[a.type].interval;
        var fedTime = Math.max(0, Math.min(now, a.feedUntil) - seen);
        // A stocked feeder keeps animals fed while you're away, spending one
        // feed per FEED_MS until the stock (shared across the pen) runs out.
        var pen = state.pens[a.type];
        if (pen && pen.feeder && pen.feed > 0) {
          var gap = away - fedTime;
          if (gap > 0) {
            var used = Math.min(pen.feed, Math.ceil(gap / FEED_MS));
            pen.feed -= used;
            fedTime = Math.min(away, fedTime + used * FEED_MS);
          }
        }
        a.grown = Math.min(iv, a.grown + fedTime);
      });
      // Hives keep filling with honey while you're away (no feeding needed).
      state.hives.forEach(function (hv) { hv.grown = Math.min(HIVE_MS, hv.grown + away); });
    }
    rollMarket(state, false);
  }

  function save() {
    store.save({
      coins: state.coins, xp: state.xp, level: state.level, sel: state.sel,
      unlocked: state.unlocked, cap: state.cap, stoves: state.stoves,
      potCap: state.potCap, soil: state.soil, sprinkler: state.sprinkler,
      oven: state.oven, heater: state.heater, trade: state.trade,
      hives: state.hives.map(function (hv) { return { grown: Math.round(hv.grown) }; }),
      inv: state.inv,
      plots: state.plots.map(function (p) {
        return { crop: p.crop, grown: Math.round(p.grown), water: Math.round(p.water), fert: !!p.fert };
      }),
      animals: state.animals.map(function (a) {
        return { type: a.type, grown: Math.round(a.grown), feedUntil: a.feedUntil };
      }),
      pens: (function () {
        var o = {};
        ANIMALS.forEach(function (a) {
          var p = state.pens[a.type] || {};
          o[a.type] = { feeder: !!p.feeder, collector: !!p.collector, feed: Math.round(p.feed || 0) };
        });
        return o;
      })(),
      cooks: state.cooks.map(function (c) { return c ? { dish: c.dish, endsAt: c.endsAt, total: c.total } : null; }),
      pots: state.pots.map(function (p) { return p ? { flower: p.flower, endsAt: p.endsAt, total: p.total } : null; }),
      quests: state.quests,
      prices: state.prices, marketUntil: state.marketUntil,
      tab: state.tab,
      lastSeen: Date.now()
    });
    dirty = false;
  }

  // Wipe the farm back to a fresh start (persisted immediately).
  function reset() {
    assignInto(state, freshState());
    save();
  }

  // ---- Expose ----
  Farm.need = need;
  Farm.ensurePen = ensurePen;
  Farm.countAnimals = countAnimals;
  Farm.freshState = freshState;
  Farm.load = load;
  Farm.save = save;
  Farm.reset = reset;
  Farm.markDirty = markDirty;
  Farm.isDirty = isDirty;
})(window.Farm);

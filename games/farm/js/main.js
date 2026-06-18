/* ============================================================================
 *  Farm — bootstrap & game loop.
 *
 *  Loaded last. Mounts the shared header, collects the DOM refs the other
 *  modules bind to, runs every module's init step, then starts the real-time
 *  tick that advances crop growth, animal production, cooking, the apiary and
 *  the market while you play. Also wires the page lifecycle (save on
 *  hide/leave, rescale on resize, re-render on language change).
 * ========================================================================== */
(function (Farm) {
  "use strict";

  var $ = Farm.$;
  // Static content + constants (config.js has run).
  var CROP_BY_ID = Farm.CROP_BY_ID, ANIMAL_BY_ID = Farm.ANIMAL_BY_ID, PROD_BY_ID = Farm.PROD_BY_ID;
  var WATER_BOOST = Farm.WATER_BOOST, WATER_MS = Farm.WATER_MS, FEED_MS = Farm.FEED_MS, HIVE_MS = Farm.HIVE_MS;
  // Module functions (every file has loaded by now).
  var sprinkleEvery = Farm.sprinkleEvery, soilMul = Farm.soilMul, spaceLeft = Farm.spaceLeft,
      addItem = Farm.addItem, addXp = Farm.addXp, rollMarket = Farm.rollMarket;
  var patch = Farm.patch, render = Farm.render, syncStats = Farm.syncStats;
  var markDirty = Farm.markDirty, save = Farm.save, load = Farm.load, reset = Farm.reset, isDirty = Farm.isDirty;
  var isInteracting = Farm.isInteracting, showPanHint = Farm.showPanHint,
      ensureScale = Farm.ensureScale, applyWorld = Farm.applyWorld;

  /* ======================================================================
   *  HEADER + DOM REFS
   * ==================================================================== */
  var ui = MG.mountHeader({
    icon: "🚜",
    titleKey: "title",
    stats: [
      { key: "coins", labelKey: "coins", value: 0 },
      { key: "level", labelKey: "level", value: 1 }
    ],
    actions: [
      {
        key: "new", labelKey: "newFarm", onClick: function () {
          if (window.confirm(MG.i18n.t("confirmReset"))) {
            reset(); render(); syncStats();
          }
        }
      }
    ]
  });

  Farm.ui = ui;
  Farm.dom = {
    worldView: $("worldView"),
    world: $("world"),
    toolbar: $("toolbar"),
    overlay: $("overlay"),
    toast: $("toast"),
    panHint: $("panHint"),
    lvl: $("lvl"),
    xpfill: $("xpfill"),
    store: $("store")
  };

  // Bind every module's cross-references (state / ui / DOM / each other) now
  // that the namespace is fully populated.
  Farm.runInits();
  var state = Farm.state;

  /* ======================================================================
   *  TICK — advance growth / production / cooking in real time
   * ==================================================================== */
  var last = performance.now();
  var patchAccum = 0, saveAccum = 0, viewAccum = 0, sprinkleAccum = 0;

  function tick(now) {
    var dt = now - last; last = now;
    if (dt > 2000) dt = 2000;

    // The sprinkler periodically re-waters every dry, still-growing plot.
    if (state.sprinkler > 0) {
      sprinkleAccum += dt;
      if (sprinkleAccum >= sprinkleEvery()) {
        sprinkleAccum = 0;
        for (var si = 0; si < state.unlocked; si++) {
          var sp = state.plots[si];
          if (sp.crop && sp.water <= 0 && sp.grown < CROP_BY_ID[sp.crop].grow) {
            sp.water = WATER_MS; markDirty();
          }
        }
      }
    }

    var gmul = soilMul();
    for (var i = 0; i < state.unlocked; i++) {
      var p = state.plots[i];
      if (!p.crop) continue;
      var c = CROP_BY_ID[p.crop];
      if (p.grown >= c.grow) continue;
      var speed = gmul;
      if (p.water > 0) { speed = WATER_BOOST * gmul; p.water = Math.max(0, p.water - dt); if (p.water === 0) markDirty(); }
      var before = p.grown;
      p.grown = Math.min(c.grow, p.grown + dt * speed);
      if (before < c.grow && p.grown >= c.grow) markDirty();
    }
    var nowMs = Date.now();
    state.animals.forEach(function (a) {
      var def = ANIMAL_BY_ID[a.type];
      var pen = state.pens[a.type];
      // A feeder keeps the animal fed on its own, spending one feed each cycle.
      if (pen && pen.feeder && nowMs >= a.feedUntil && pen.feed > 0) {
        pen.feed -= 1; a.feedUntil = nowMs + FEED_MS; markDirty();
      }
      if (a.grown < def.interval) {
        if (nowMs < a.feedUntil) {
          var before = a.grown;
          a.grown = Math.min(def.interval, a.grown + dt);
          if (before < def.interval && a.grown >= def.interval) markDirty();
        }
      } else if (pen && pen.collector && spaceLeft() >= 1) {
        // A collector gathers ripe produce into storage automatically.
        addItem(def.prod, 1);
        addXp((PROD_BY_ID[def.prod] || {}).xp || 0);
        a.grown = 0; markDirty();
      }
    });
    // Hives quietly fill with honey — no feeding required.
    state.hives.forEach(function (hv) {
      if (hv.grown >= HIVE_MS) return;
      var before = hv.grown;
      hv.grown = Math.min(HIVE_MS, hv.grown + dt);
      if (before < HIVE_MS && hv.grown >= HIVE_MS) markDirty();
    });
    if (nowMs >= state.marketUntil) rollMarket(state, false);

    patchAccum += dt;
    if (patchAccum > 200) { patch(); patchAccum = 0; }

    // A full (pan-preserving) re-render once a second keeps building status
    // lines, badges, countdowns and re-rolled prices honest. Skip it while
    // the player is actively dragging so the pan stays buttery.
    viewAccum += dt;
    if (viewAccum > 1000) { viewAccum = 0; if (!isInteracting()) render(); }

    saveAccum += dt;
    if (isDirty() && saveAccum > 1500) { save(); saveAccum = 0; }

    requestAnimationFrame(tick);
  }

  // Persist on leave.
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") save();
  });

  // Keep the world covering the viewport as it resizes / rotates.
  window.addEventListener("resize", function () { ensureScale(); applyWorld(); });

  // Re-localize live.
  MG.i18n.onChange(function () { render(); });

  /* ============================ Boot ============================ */
  load();
  render();
  syncStats();
  showPanHint();
  requestAnimationFrame(tick);
})(window.Farm);

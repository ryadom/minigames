/* ============================================================================
 *  Farm — the view layer (everything that produces DOM / HTML).
 *
 *  Renders the pannable world (building signs, crop plots, animal pens, the
 *  seed toolbar) and the sliding building panels (market, kitchen, greenhouse,
 *  apiary, pens, orders). `render()` rebuilds the world and refreshes the open
 *  panel; `patch()` does the cheap per-frame updates (progress bars, sprites);
 *  `syncStats()` keeps the header / status strip honest; `toast()` shows the
 *  transient message bubble.
 * ========================================================================== */
(function (Farm) {
  "use strict";

  // ---- Static content & pure helpers (config / scene already loaded) ----
  var esc = Farm.esc, $ = Farm.$;
  var CROPS = Farm.CROPS, FLOWERS = Farm.FLOWERS, DISHES = Farm.DISHES, ANIMALS = Farm.ANIMALS,
      ITEM = Farm.ITEM, CROP_BY_ID = Farm.CROP_BY_ID, FLOWER_BY_ID = Farm.FLOWER_BY_ID,
      DISH_BY_ID = Farm.DISH_BY_ID, ANIMAL_BY_ID = Farm.ANIMAL_BY_ID;
  var GRID = Farm.GRID, MAX_PER_ANIMAL = Farm.MAX_PER_ANIMAL, MAX_POTS = Farm.MAX_POTS,
      MAX_HIVES = Farm.MAX_HIVES, MAX_SOIL = Farm.MAX_SOIL, MAX_SPRINKLER = Farm.MAX_SPRINKLER,
      MAX_OVEN = Farm.MAX_OVEN, MAX_HEATER = Farm.MAX_HEATER, MAX_TRADE = Farm.MAX_TRADE,
      FEEDER_CAP = Farm.FEEDER_CAP, HIVE_MS = Farm.HIVE_MS, APIARY_LVL = Farm.APIARY_LVL,
      FERT_COST = Farm.FERT_COST, SOIL_STEP = Farm.SOIL_STEP, OVEN_STEP = Farm.OVEN_STEP,
      HEATER_STEP = Farm.HEATER_STEP, TRADE_STEP = Farm.TRADE_STEP;
  var SEED_SPRITE = Farm.SEED_SPRITE, SPROUT_SPRITE = Farm.SPROUT_SPRITE, LEAF_SPRITE = Farm.LEAF_SPRITE;
  // Scene geometry / SVG.
  var WORLD_W = Farm.WORLD_W, WORLD_H = Farm.WORLD_H, BLD = Farm.BLD, PEN_DEFS = Farm.PEN_DEFS,
      FIELD = Farm.FIELD, plotPos = Farm.plotPos, geom = Farm.geom, buildScene = Farm.buildScene, pf = Farm.pf;
  // i18n.
  var name = Farm.itemName, tf = Farm.tf;
  // Economy.
  var invCount = Farm.invCount, isUnlocked = Farm.isUnlocked, price = Farm.price, stk = Farm.stk,
      hasRecipe = Farm.hasRecipe, plotCost = Farm.plotCost, feederCost = Farm.feederCost,
      collectorCost = Farm.collectorCost, potCost = Farm.potCost, hiveCost = Farm.hiveCost,
      capCost = Farm.capCost, stoveCost = Farm.stoveCost, soilCost = Farm.soilCost,
      sprinklerCost = Farm.sprinklerCost, ovenCost = Farm.ovenCost, heaterCost = Farm.heaterCost,
      tradeCost = Farm.tradeCost;
  // State helpers.
  var ensurePen = Farm.ensurePen, countAnimals = Farm.countAnimals, need = Farm.need;

  // ---- Live state, header UI, DOM refs & world-transform (bound at boot) ----
  var state, ui, world, toolbarEl, overlay, toastEl, lvlEl, xpfillEl, storeEl, ensureScale, applyWorld;
  Farm.ready(function () {
    state = Farm.state;
    ui = Farm.ui;
    world = Farm.dom.world;
    toolbarEl = Farm.dom.toolbar;
    overlay = Farm.dom.overlay;
    toastEl = Farm.dom.toast;
    lvlEl = Farm.dom.lvl;
    xpfillEl = Farm.dom.xpfill;
    storeEl = Farm.dom.store;
    ensureScale = Farm.ensureScale;
    applyWorld = Farm.applyWorld;
  });

  // Buildings you can step into; each opens as a sliding panel.
  var PANELS = {
    market: { ico: "🏪", title: "tabMarket" },
    pen:    { ico: "🐄", title: "" },
    cook:   { ico: "🍳", title: "tabCook" },
    greenhouse: { ico: "🌻", title: "tabGreenhouse" },
    apiary: { ico: "🐝", title: "tabApiary" },
    quests: { ico: "📋", title: "tabQuests" }
  };
  var overlayTab = null;
  var overlayPenType = null;
  var closeTimer = null;

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1500);
  }

  function syncStats() {
    ui.setStat("coins", state.coins);
    ui.setStat("level", state.level);
    lvlEl.textContent = "⭐ " + state.level;
    xpfillEl.style.width = Math.min(100, (state.xp / need(state.level)) * 100) + "%";
    var n = invCount();
    storeEl.textContent = "📦 " + n + "/" + state.cap;
    storeEl.classList.toggle("full", n >= state.cap);
  }

  /* ----------------------------- OVERLAYS ------------------------------ */
  // A transparent tap target over a drawn building, carrying its shop sign
  // (icon + name + a live status line) and an optional ready badge.
  function hotspot(b, title, sub, badge) {
    var g = geom(b);
    var left = g.minX / WORLD_W * 100, top = g.minY / WORLD_H * 100;
    var w = (g.maxX - g.minX) / WORLD_W * 100, h = (g.maxY - g.minY) / WORLD_H * 100;
    return '<button class="hotspot" data-act="open" data-arg="' + b.act + '" ' +
      'style="left:' + pf(left) + '%;top:' + pf(top) + '%;width:' + pf(w) + '%;height:' + pf(h) + '%">' +
      (badge ? '<span class="b-badge">' + badge + "</span>" : "") +
      '<span class="sign"><span class="si">' + b.ico + "</span>" +
        '<span class="st">' + esc(title) + "</span>" +
        (sub ? '<span class="ss">' + esc(sub) + "</span>" : "") +
      "</span></button>";
  }

  // One overlay per animal pen: a label tag plus the animals living there
  // as individual hold-and-sweep cells (data-animcell = index into
  // state.animals). Tapping a pen opens its panel; sweeping the animals
  // collects / feeds by hand. Locked pens show the level gate.
  function penHotspots() {
    var html = "";
    PEN_DEFS.forEach(function (pn) {
      var def = ANIMAL_BY_ID[pn.type];
      var pen = state.pens[pn.type] || {};
      var left = pn.L / WORLD_W * 100, top = pn.T / WORLD_H * 100;
      var w = (pn.R - pn.L) / WORLD_W * 100, h = (pn.B - pn.T) / WORLD_H * 100;
      var locked = !isUnlocked(def.lvl);
      var mine = [];
      state.animals.forEach(function (a, i) { if (a.type === pn.type) mine.push({ a: a, i: i }); });

      var act = "openpen", arg = pn.type, inner = "", ready = 0;
      if (locked) {
        act = "penlocked";
        inner = '<span class="pen-lock">🔒 ' + esc(tf("lvl", { n: def.lvl })) + "</span>";
      } else if (!mine.length) {
        inner = '<span class="pen-buy"><span class="pi">' + def.ico + "</span>🛒</span>";
      } else {
        inner = '<span class="pen-animals">';
        mine.forEach(function (m) {
          var rdy = m.a.grown >= def.interval;
          var fed = Date.now() < m.a.feedUntil;
          if (rdy) ready++;
          inner += '<span class="an' + (rdy ? " rdy" : (fed ? " fed" : " hungry")) +
            '" data-animcell="' + m.i + '">' + def.ico +
            (rdy ? '<span class="prod">' + ITEM[def.prod].ico + "</span>" : "") + "</span>";
        });
        inner += "</span>";
      }

      var auto = (pen.feeder ? "🍽️" : "") + (pen.collector ? "🧺" : "");
      var tag = '<span class="pen-tag">' + def.ico + " " + esc(name(pn.type)) +
        (mine.length ? " ×" + mine.length : "") + (auto ? " " + auto : "") + "</span>";
      html += '<button class="hotspot pen-hot' + (locked ? " locked" : "") + '" data-act="' + act + '"' +
        ' data-arg="' + arg + '"' +
        ' style="left:' + pf(left) + '%;top:' + pf(top) + '%;width:' + pf(w) + '%;height:' + pf(h) + '%">' +
        (ready ? '<span class="b-badge">' + ready + "</span>" : "") +
        tag + inner + "</button>";
    });
    return html;
  }

  function plotSprite(p) {
    var c = CROP_BY_ID[p.crop];
    var f = p.grown / c.grow;
    if (f >= 1) return c.ico;
    if (f < 0.33) return SEED_SPRITE;
    if (f < 0.66) return SPROUT_SPRITE;
    return LEAF_SPRITE;
  }

  // The 25 crop tiles, laid over the tilled field backing.
  function renderPlots() {
    var h = "";
    var lw = FIELD.tile / WORLD_W * 100, lh = FIELD.tile / WORLD_H * 100;
    for (var i = 0; i < GRID; i++) {
      var pos = plotPos(i);
      var left = pos.x / WORLD_W * 100, top = pos.y / WORLD_H * 100;
      var style = 'style="left:' + pf(left) + '%;top:' + pf(top) + '%;width:' + pf(lw) + '%;height:' + pf(lh) + '%"';
      if (i >= state.unlocked) {
        var canBuy = i === state.unlocked;
        h += '<button class="plot locked" data-plotcell="' + i + '" data-act="' + (canBuy ? "buyplot" : "noop") + '" ' + style + ' aria-label="locked">' +
          '<span class="sprite">' + (canBuy ? "🔓" : "🔒") + "</span>" +
          (canBuy ? '<span class="pcost">🪙 ' + plotCost() + "</span>" : "") + "</button>";
        continue;
      }
      var p = state.plots[i];
      var cls = "plot", spr = "", w = "0";
      if (p.crop) {
        var c = CROP_BY_ID[p.crop];
        var rdy = p.grown >= c.grow;
        cls += rdy ? " ready" : (p.water > 0 ? " watered" : "");
        if (p.fert) cls += " fert";
        spr = plotSprite(p);
        w = Math.min(100, (p.grown / c.grow) * 100).toFixed(1);
      } else { cls += " empty"; }
      h += '<button class="' + cls + '" data-plotcell="' + i + '" data-act="plot" data-arg="' + i + '" ' + style + '>' +
        '<span class="sprite">' + spr + "</span>" +
        '<span class="bar"><i style="width:' + w + '%"></i></span></button>';
    }
    return h;
  }

  // The seed / tool selector that floats along the bottom of the map.
  function renderToolbar() {
    var h = "";
    CROPS.forEach(function (c) {
      var lock = !isUnlocked(c.lvl);
      var sel = state.sel === c.id ? " selected" : "";
      h += '<button class="tool' + sel + (lock ? " locked" : "") + '" data-act="seed" data-arg="' + c.id + '">' +
        '<span class="ico">' + c.ico + "</span>" +
        '<span class="name">' + esc(name(c.id)) + "</span>" +
        (lock ? '<span class="cost lock">🔒 ' + tf("lvl", { n: c.lvl }) + "</span>"
              : '<span class="cost">🪙 ' + c.seed + "</span>") +
        stk(c.id) +
        "</button>";
    });
    h += '<button class="tool' + (state.sel === "water" ? " selected" : "") + '" data-act="seed" data-arg="water">' +
      '<span class="ico">💧</span><span class="name">' + esc(MG.i18n.t("water")) + '</span><span class="cost">·</span></button>';
    h += '<button class="tool' + (state.sel === "fert" ? " selected" : "") + '" data-act="seed" data-arg="fert">' +
      '<span class="ico">💩</span><span class="name">' + esc(MG.i18n.t("fert")) + '</span><span class="cost">🪙 ' + FERT_COST + "</span></button>";
    h += '<button class="tool' + (state.sel === "clear" ? " selected" : "") + '" data-act="seed" data-arg="clear">' +
      '<span class="ico">🧺</span><span class="name">' + esc(MG.i18n.t("clear")) + '</span><span class="cost">·</span></button>';
    return h;
  }

  /* ======================================================================
   *  RENDER — the world is always the base; a building panel may slide up.
   * ==================================================================== */
  function render() {
    ensureScale();
    var tbScroll = toolbarEl.scrollLeft;
    world.innerHTML =
      '<svg viewBox="0 0 ' + WORLD_W + " " + WORLD_H + '" preserveAspectRatio="none" aria-hidden="true">' + buildScene() + "</svg>" +
      hotspot(BLD.market, MG.i18n.t("tabMarket"), "🪙 " + state.coins, "") +
      hotspot(BLD.cook, MG.i18n.t("tabCook"), cookStatus(), readyCounts().cook || "") +
      hotspot(BLD.greenhouse, MG.i18n.t("tabGreenhouse"), greenhouseStatus(), readyCounts().pot || "") +
      hotspot(BLD.apiary, MG.i18n.t("tabApiary"), apiaryStatus(), readyCounts().hive || "") +
      hotspot(BLD.quests, MG.i18n.t("tabQuests"), "🎁 " + readyCounts().fillable + "/" + state.quests.length, readyCounts().fillable || "") +
      penHotspots() +
      renderPlots();
    applyWorld();
    toolbarEl.innerHTML = renderToolbar();
    toolbarEl.scrollLeft = tbScroll;
    renderOverlay();
    syncStats();
  }

  function cookStatus() {
    var cooking = 0;
    state.cooks.forEach(function (c) { if (c && Date.now() < c.endsAt) cooking++; });
    return "🍳 " + state.stoves + (cooking ? " · ⏲️ " + cooking : "");
  }
  function greenhouseStatus() {
    var growing = 0;
    state.pots.forEach(function (p) { if (p && Date.now() < p.endsAt) growing++; });
    return "🌷 " + state.potCap + (growing ? " · ⏲️ " + growing : "");
  }
  function apiaryStatus() {
    if (!isUnlocked(APIARY_LVL)) return "🔒 " + tf("lvl", { n: APIARY_LVL });
    return "🍯 " + state.hives.length + "/" + MAX_HIVES;
  }
  function readyCounts() {
    var cook = 0;
    state.cooks.forEach(function (c) { if (c && Date.now() >= c.endsAt) cook++; });
    var pot = 0;
    state.pots.forEach(function (p) { if (p && Date.now() >= p.endsAt) pot++; });
    var pen = 0;
    state.animals.forEach(function (a) { if (a.grown >= ANIMAL_BY_ID[a.type].interval) pen++; });
    var hive = 0;
    state.hives.forEach(function (hv) { if (hv.grown >= HIVE_MS) hive++; });
    var fillable = 0;
    state.quests.forEach(function (q) { if (q && (state.inv[q.item] || 0) >= q.need) fillable++; });
    return { cook: cook, pot: pot, pen: pen, hive: hive, fillable: fillable };
  }

  // Mount / refresh the sliding building panel (same behaviour as before).
  function renderOverlay() {
    var tab = state.tab;
    if (!PANELS[tab]) {
      if (overlayTab !== null) {
        overlay.className = "overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlayTab = null;
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = setTimeout(function () {
          closeTimer = null;
          if (!PANELS[state.tab]) overlay.innerHTML = "";
        }, 260);
      }
      return;
    }
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    var body = tab === "market" ? renderMarket()
             : tab === "pen"    ? renderPen(state.penType)
             : tab === "cook"   ? renderCook()
             : tab === "greenhouse" ? renderGreenhouse()
             : tab === "apiary" ? renderApiary()
             : renderQuests();
    // The pen panel's icon / title depend on which animal you tapped, so a
    // change of pen type counts as a fresh panel even when the tab is "pen".
    var fresh = overlayTab !== tab || (tab === "pen" && overlayPenType !== state.penType);
    if (fresh) {
      var p = PANELS[tab];
      var ico = tab === "pen" ? ANIMAL_BY_ID[state.penType].ico : p.ico;
      var ttl = tab === "pen" ? name(state.penType) : MG.i18n.t(p.title);
      overlay.innerHTML =
        '<div class="sheet">' +
          '<div class="sheet-head">' +
            '<span class="sh-ico">' + ico + "</span>" +
            '<span class="sh-ttl">' + esc(ttl) + "</span>" +
            '<button class="sh-close" data-act="close" aria-label="close">✕</button>' +
          "</div>" +
          '<div class="sheet-body"><div class="wrap" id="sheetwrap">' + body + "</div></div>" +
        "</div>";
      overlay.removeAttribute("aria-hidden");
      void overlay.offsetWidth;
      overlay.className = "overlay show";
      overlayTab = tab;
      overlayPenType = state.penType;
    } else {
      var w = $("sheetwrap");
      if (w) w.innerHTML = body;
    }
  }

  function tipLine(key) { return '<div class="tip">' + esc(MG.i18n.t(key)) + "</div>"; }

  // A full-width "Collect all" button shown above a building's slots when
  // anything is ready to gather; `kind` routes the action (cook/pot/hive/pen).
  function collectAllBar(kind, count) {
    if (!count) return "";
    return '<div class="collect-all"><button class="btn go" data-act="collectall" data-arg="' + kind + '">' +
      esc(MG.i18n.t("collectAll")) + " (" + count + ")</button></div>";
  }
  // A slim summary card standing in for N empty slots, so panels don't grow
  // a long tail of blank stoves / pots to scroll past.
  function freeSlotsCard(ico, n) {
    if (!n) return "";
    return '<div class="card slim"><span class="big">' + ico + '</span>' +
      '<div class="body"><div class="sub">' + esc(tf("freeSlots", { n: n })) + "</div></div></div>";
  }

  /* -------------------------------- PEN -------------------------------- */
  // Per-animal management: buy more (up to MAX_PER_ANIMAL), run the pen with
  // a feeder (auto-feeds from a loaded food stock) and a collector
  // (auto-gathers produce), or collect ripe produce by hand in one tap.
  function renderPen(type) {
    var def = ANIMAL_BY_ID[type];
    if (!def) return tipLine("tipPen");
    var pen = ensurePen(type);
    var mine = [];
    state.animals.forEach(function (a) { if (a.type === type) mine.push(a); });
    var count = mine.length, ready = 0, fedN = 0, prog = 0;
    mine.forEach(function (a) {
      if (a.grown >= def.interval) ready++;
      if (Date.now() < a.feedUntil) fedN++;
      prog += Math.min(1, a.grown / def.interval);
    });

    var h = tipLine("tipPen");

    // ---- Summary + collect-all -------------------------------------------
    if (!count) {
      h += '<div class="empty-note">' + def.ico + "<br>" + esc(MG.i18n.t("penEmpty")) + "</div>";
    } else {
      var statusBadge = ready
        ? '<span class="badge ready">' + ITEM[def.prod].ico + " ×" + ready + "</span>"
        : '<span class="badge ' + (fedN === count ? "" : "lock") + '">' + fedN + "/" + count + " " + esc(MG.i18n.t("fed")) + "</span>";
      var pct = (prog / count * 100).toFixed(1);
      h += '<div class="card"><span class="big">' + def.ico + '</span><div class="body">' +
        '<div class="ttl">' + esc(name(type)) + ' <span class="badge lock">' + esc(tf("owned", { n: count, max: MAX_PER_ANIMAL })) + "</span> " + statusBadge + "</div>" +
        '<div class="sub">' + ITEM[def.prod].ico + " " + esc(name(def.prod)) + " " + stk(def.prod) + "</div>" +
        '<div class="pbar"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="right"><button class="btn go sm" data-act="collectall" data-arg="pen"' + (ready ? "" : " disabled") + ">" +
          esc(MG.i18n.t("collectAll")) + "</button></div></div>";
    }

    // ---- Buy more --------------------------------------------------------
    if (count < MAX_PER_ANIMAL) {
      h += '<div class="card"><span class="big">🛒</span><div class="body">' +
        '<div class="ttl">' + esc(MG.i18n.t("buyAnimal")) + " " + def.ico + " " + esc(name(type)) + "</div>" +
        '<div class="sub">' + ITEM[def.prod].ico + " " + esc(name(def.prod)) + " · 🍽️ " + ITEM[def.feed].ico + " " + esc(name(def.feed)) + "</div></div>" +
        '<div class="right"><button class="btn sm" data-act="buyanimal" data-arg="' + type + '"' + (state.coins >= def.cost ? "" : " disabled") + ">🪙 " + def.cost + "</button></div></div>";
    } else {
      h += '<div class="card"><span class="big">🛒</span><div class="body">' +
        '<div class="ttl">' + esc(name(type)) + "</div></div>" +
        '<div class="right"><span class="badge lock">' + esc(tf("penFull", { n: MAX_PER_ANIMAL })) + "</span></div></div>";
    }

    // ---- Feeder (load food → animals auto-feed) --------------------------
    if (!pen.feeder) {
      var fc = feederCost(type);
      h += '<div class="card"><span class="big">🍽️</span><div class="body">' +
        '<div class="ttl">' + esc(MG.i18n.t("feeder")) + "</div>" +
        '<div class="sub">' + esc(tf("feederSub", { item: ITEM[def.feed].ico, name: name(def.feed) })) + "</div></div>" +
        '<div class="right"><button class="btn sm" data-act="buyfeeder" data-arg="' + type + '"' + (state.coins >= fc ? "" : " disabled") + ">🪙 " + fc + "</button></div></div>";
    } else {
      var feedHave = state.inv[def.feed] || 0;
      var fpct = (pen.feed / FEEDER_CAP * 100).toFixed(1);
      h += '<div class="card"><span class="big">🍽️</span><div class="body">' +
        '<div class="ttl">' + esc(MG.i18n.t("feeder")) + ' <span class="badge ready">' + esc(MG.i18n.t("autoFeed")) + "</span></div>" +
        '<div class="sub">' + ITEM[def.feed].ico + " " + pen.feed + "/" + FEEDER_CAP + " · 📦 " + feedHave + "</div>" +
        '<div class="pbar"><i style="width:' + fpct + '%"></i></div></div>' +
        '<div class="right"><button class="btn alt sm" data-act="loadfeed" data-arg="' + type + '"' + (feedHave > 0 && pen.feed < FEEDER_CAP ? "" : " disabled") + ">" +
          esc(MG.i18n.t("loadFeed")) + " " + ITEM[def.feed].ico + "</button></div></div>";
    }

    // ---- Collector (auto-gathers produce) --------------------------------
    if (!pen.collector) {
      var cc = collectorCost(type);
      h += '<div class="card"><span class="big">🧺</span><div class="body">' +
        '<div class="ttl">' + esc(MG.i18n.t("collector")) + "</div>" +
        '<div class="sub">' + esc(MG.i18n.t("collectorSub")) + "</div></div>" +
        '<div class="right"><button class="btn sm" data-act="buycollector" data-arg="' + type + '"' + (state.coins >= cc ? "" : " disabled") + ">🪙 " + cc + "</button></div></div>";
    } else {
      h += '<div class="card"><span class="big">🧺</span><div class="body">' +
        '<div class="ttl">' + esc(MG.i18n.t("collector")) + ' <span class="badge ready">' + esc(MG.i18n.t("autoCollect")) + "</span></div>" +
        '<div class="sub">' + esc(MG.i18n.t("collectorSub")) + "</div></div></div>";
    }
    return h;
  }

  /* ------------------------------- KITCHEN ----------------------------- */
  function renderCook() {
    var h = tipLine("tipCook");

    h += '<div class="section-h">' + esc(MG.i18n.t("stoves")) + " (" + state.stoves + ")</div>";
    h += collectAllBar("cook", readyCounts().cook);
    var freeStoves = 0;
    state.cooks.forEach(function (c, i) {
      if (!c) { freeStoves++; return; }
      var def = DISH_BY_ID[c.dish];
      var total = c.total || def.cook;
      var left = Math.max(0, c.endsAt - Date.now());
      var ready = left <= 0;
      var pct = Math.min(100, ((total - left) / total) * 100).toFixed(1);
      h += '<div class="card" data-cook="' + i + '"><span class="big">' + def.ico + '</span><div class="body">' +
        '<div class="ttl">' + esc(name(c.dish)) + " " + stk(c.dish) +
          (ready ? ' <span class="badge ready">✓</span>' : ' <span class="badge">' + fmtTime(left) + "</span>") + "</div>" +
        '<div class="pbar' + (ready ? "" : " warm") + '" data-cbar="' + i + '"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="right"><button class="btn go sm" data-act="collectcook" data-arg="' + i + '"' + (ready ? "" : " disabled") + ">" +
          esc(MG.i18n.t("collect")) + "</button></div></div>";
    });
    h += freeSlotsCard("🍳", freeStoves);

    h += '<div class="section-h">' + esc(MG.i18n.t("recipes")) + "</div>";
    var freeStove = state.cooks.some(function (c) { return !c; });
    DISHES.forEach(function (d) {
      var lock = !isUnlocked(d.lvl);
      var can = hasRecipe(d.recipe);
      var ings = "";
      for (var k in d.recipe) {
        var miss = (state.inv[k] || 0) < d.recipe[k];
        ings += '<span class="ing' + (miss ? " miss" : "") + '">' + ITEM[k].ico + " " +
          (state.inv[k] || 0) + "/" + d.recipe[k] + "</span>";
      }
      h += '<div class="card' + (lock ? " locked" : "") + '"><span class="big">' + d.ico + '</span><div class="body">' +
        '<div class="ttl">' + esc(name(d.id)) + " " + stk(d.id) + ' <span class="badge lock">+' + d.xp + " XP</span></div>" +
        (lock ? '<div class="sub">🔒 ' + esc(tf("needLevel", { n: d.lvl })) + "</div>"
              : '<div class="ingredients">' + ings + "</div>") +
        "</div><div class='right'>" +
        (lock ? "" : '<button class="btn sm" data-act="cook" data-arg="' + d.id + '"' +
          (can && freeStove ? "" : " disabled") + ">" + esc(MG.i18n.t("cook")) + "</button>") +
        "</div></div>";
    });
    return h;
  }
  function fmtTime(ms) {
    var s = Math.ceil(ms / 1000);
    if (s < 60) return s + "s";
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }

  /* ----------------------------- GREENHOUSE ---------------------------- */
  // Flower pots mirror the kitchen's stoves: plant a flower into a free pot,
  // it grows on a timer, then you collect the bloom into storage.
  function renderGreenhouse() {
    var h = tipLine("tipGreenhouse");

    h += '<div class="section-h">' + esc(MG.i18n.t("pots")) + " (" + state.potCap + ")</div>";
    h += collectAllBar("pot", readyCounts().pot);
    var freePots = 0;
    state.pots.forEach(function (p, i) {
      if (!p) { freePots++; return; }
      var def = FLOWER_BY_ID[p.flower];
      var total = p.total || def.grow;
      var left = Math.max(0, p.endsAt - Date.now());
      var ready = left <= 0;
      var pct = Math.min(100, ((total - left) / total) * 100).toFixed(1);
      h += '<div class="card" data-pot="' + i + '"><span class="big">' + def.ico + '</span><div class="body">' +
        '<div class="ttl">' + esc(name(p.flower)) + " " + stk(p.flower) +
          (ready ? ' <span class="badge ready">✓</span>' : ' <span class="badge">' + fmtTime(left) + "</span>") + "</div>" +
        '<div class="pbar' + (ready ? "" : " warm") + '" data-potbar="' + i + '"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="right"><button class="btn go sm" data-act="collectpot" data-arg="' + i + '"' + (ready ? "" : " disabled") + ">" +
          esc(MG.i18n.t("collect")) + "</button></div></div>";
    });
    h += freeSlotsCard("🪴", freePots);
    if (state.potCap < MAX_POTS) {
      h += upgradeCard("pot", "🪴", MG.i18n.t("buyPot"), state.potCap + " → " + (state.potCap + 1), potCost());
    }

    h += '<div class="section-h">' + esc(MG.i18n.t("flowers")) + "</div>";
    var freePot = state.pots.some(function (p) { return !p; });
    FLOWERS.forEach(function (f) {
      var lock = !isUnlocked(f.lvl);
      var canPay = state.coins >= f.seed;
      h += '<div class="card' + (lock ? " locked" : "") + '"><span class="big">' + f.ico + '</span><div class="body">' +
        '<div class="ttl">' + esc(name(f.id)) + " " + stk(f.id) + ' <span class="badge lock">+' + f.xp + " XP</span></div>" +
        (lock ? '<div class="sub">🔒 ' + esc(tf("needLevel", { n: f.lvl })) + "</div>"
              : '<div class="sub">🪙 ' + f.seed + " · ⏲️ " + fmtTime(f.grow) + " · " + priceHtml(f.id) + "</div>") +
        "</div><div class='right'>" +
        (lock ? "" : '<button class="btn sm" data-act="plant" data-arg="' + f.id + '"' +
          (canPay && freePot ? "" : " disabled") + ">" + esc(MG.i18n.t("plant")) + "</button>") +
        "</div></div>";
    });
    return h;
  }

  /* ------------------------------- APIARY ------------------------------ */
  // Beehives mirror animals but need no feeding: each fills with honey on a
  // timer, then you collect a jar. Buy more hives up to MAX_HIVES.
  function renderApiary() {
    var h = tipLine("tipApiary");
    h += '<div class="section-h">' + esc(MG.i18n.t("hives")) + " (" + state.hives.length + "/" + MAX_HIVES + ")</div>";
    if (!state.hives.length) {
      h += '<div class="empty-note">🐝🍯<br>' + esc(MG.i18n.t("apiaryEmpty")) + "</div>";
    }
    h += collectAllBar("hive", readyCounts().hive);
    var honey = ITEM.honey;
    state.hives.forEach(function (hv, i) {
      var ready = hv.grown >= HIVE_MS;
      var left = Math.max(0, HIVE_MS - hv.grown);
      var pct = Math.min(100, (hv.grown / HIVE_MS) * 100).toFixed(1);
      h += '<div class="card" data-hive="' + i + '"><span class="big">🐝</span><div class="body">' +
        '<div class="ttl">' + honey.ico + " " + esc(name("honey")) + " " + stk("honey") +
          (ready ? ' <span class="badge ready">' + honey.ico + "</span>" : ' <span class="badge">' + fmtTime(left) + "</span>") + "</div>" +
        '<div class="pbar' + (ready ? "" : " warm") + '" data-hivebar="' + i + '"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="right"><button class="btn go sm" data-act="collecthive" data-arg="' + i + '"' + (ready ? "" : " disabled") + ">" +
          esc(MG.i18n.t("collect")) + "</button></div></div>";
    });
    if (state.hives.length < MAX_HIVES) {
      h += upgradeCard("hive", "🐝", MG.i18n.t("buyHive"), state.hives.length + " → " + (state.hives.length + 1), hiveCost());
    }
    return h;
  }

  /* ------------------------------- MARKET ------------------------------ */
  function priceHtml(id) {
    var m = state.prices[id] || 1;
    var arrow = m > 1.08 ? '<span class="up">▲</span>' : m < 0.92 ? '<span class="down">▼</span>' : "";
    return '<span class="price">🪙 ' + price(id) + " " + arrow + "</span>";
  }
  function renderMarket() {
    var h = tipLine("tipMarket");

    h += '<div class="section-h">' + esc(MG.i18n.t("mSell")) + "</div>";
    var ids = [];
    for (var id in ITEM) if (state.inv[id]) ids.push(id);
    ids.sort(function (a, b) { return price(b) - price(a); });
    if (!ids.length) {
      h += '<div class="empty-note">' + esc(MG.i18n.t("emptyStore")) + "</div>";
    } else {
      ids.forEach(function (id) {
        h += '<div class="card"><span class="big">' + ITEM[id].ico + '</span><div class="body">' +
          '<div class="ttl">' + esc(name(id)) + " " + stk(id) + "</div>" +
          '<div class="sub">' + priceHtml(id) + "</div></div>" +
          '<div class="right" style="flex-direction:row">' +
          '<button class="btn alt sm" data-act="sell" data-arg="' + id + '">' + esc(MG.i18n.t("sell")) + "</button>" +
          '<button class="btn sm" data-act="sellall" data-arg="' + id + '">' + esc(MG.i18n.t("sellAll")) + "</button>" +
          "</div></div>";
      });
    }

    h += '<div class="section-h">' + esc(MG.i18n.t("mAnimals")) + "</div>";
    ANIMALS.forEach(function (a) {
      var lock = !isUnlocked(a.lvl);
      var owned = countAnimals(a.type);
      var full = owned >= MAX_PER_ANIMAL;
      var can = !lock && !full && state.coins >= a.cost;
      h += '<div class="card' + (lock ? " locked" : "") + '"><span class="big">' + a.ico + '</span><div class="body">' +
        '<div class="ttl">' + esc(name(a.id)) + ' <span class="badge lock">' + esc(tf("owned", { n: owned, max: MAX_PER_ANIMAL })) + "</span></div>" +
        (lock ? '<div class="sub">🔒 ' + esc(tf("needLevel", { n: a.lvl })) + "</div>"
              : '<div class="sub">' + ITEM[a.prod].ico + " " + esc(name(a.prod)) + " " + stk(a.prod) +
                " · 🍽️ " + ITEM[a.feed].ico + " " + esc(name(a.feed)) + " " + stk(a.feed) + "</div>") +
        "</div><div class='right'>" +
        (lock ? ""
              : full ? '<span class="badge lock">' + esc(tf("penFull", { n: MAX_PER_ANIMAL })) + "</span>"
                     : '<button class="btn sm" data-act="buyanimal" data-arg="' + a.id + '"' +
                       (can ? "" : " disabled") + ">🪙 " + a.cost + "</button>") +
        "</div></div>";
    });

    h += '<div class="section-h">' + esc(MG.i18n.t("mUpgrades")) + "</div>";
    h += upgradeCard("cap", "📦", MG.i18n.t("upCap"), state.cap + " → " + (state.cap + 20), capCost());
    h += upgradeCard("stove", "🍳", MG.i18n.t("upStove"), state.stoves + " → " + (state.stoves + 1), stoveCost());
    var soilSub = tf("upSoilSub", { n: Math.round((state.soil + 1) * SOIL_STEP * 100) });
    h += upgradeCard("soil", "🌱", MG.i18n.t("upSoil"), soilSub, soilCost(), state.soil >= MAX_SOIL);
    var sprSub = MG.i18n.t("upSprinklerSub") + (state.sprinkler ? " · ⚡" + state.sprinkler : "");
    h += upgradeCard("sprinkler", "💧", MG.i18n.t("upSprinkler"), sprSub, sprinklerCost(), state.sprinkler >= MAX_SPRINKLER);
    var ovenSub = tf("upOvenSub", { n: Math.round((state.oven + 1) * OVEN_STEP * 100) });
    h += upgradeCard("oven", "🔥", MG.i18n.t("upOven"), ovenSub, ovenCost(), state.oven >= MAX_OVEN);
    var heaterSub = tf("upHeaterSub", { n: Math.round((state.heater + 1) * HEATER_STEP * 100) });
    h += upgradeCard("heater", "🌡️", MG.i18n.t("upHeater"), heaterSub, heaterCost(), state.heater >= MAX_HEATER);
    var tradeSub = tf("upTradeSub", { n: Math.round((state.trade + 1) * TRADE_STEP * 100) });
    h += upgradeCard("trade", "🤝", MG.i18n.t("upTrade"), tradeSub, tradeCost(), state.trade >= MAX_TRADE);
    return h;
  }
  function upgradeCard(id, ico, ttl, sub, cost, maxed) {
    var right = maxed
      ? '<span class="badge lock">' + esc(MG.i18n.t("maxed")) + "</span>"
      : '<button class="btn sm" data-act="upgrade" data-arg="' + id + '"' +
        (state.coins < cost ? " disabled" : "") + ">🪙 " + cost + "</button>";
    return '<div class="card"><span class="big">' + ico + '</span><div class="body">' +
      '<div class="ttl">' + esc(ttl) + '</div><div class="sub">' + esc(sub) + "</div></div>" +
      '<div class="right">' + right + "</div></div>";
  }

  /* ------------------------------- QUESTS ------------------------------ */
  function renderQuests() {
    var h = tipLine("tipQuests");
    state.quests.forEach(function (q, i) {
      if (!q) { h += '<div class="card"><div class="body"><div class="sub">' + esc(MG.i18n.t("newOrder")) + "</div></div></div>"; return; }
      var have = state.inv[q.item] || 0;
      var can = have >= q.need;
      h += '<div class="card"><span class="big">' + ITEM[q.item].ico + '</span><div class="body">' +
        '<div class="ttl">' + esc(MG.i18n.t("wants")) + " " + q.need + "× " + esc(name(q.item)) +
          ' <span class="badge ' + (can ? "ready" : "lock") + '">' + have + "/" + q.need + "</span></div>" +
        '<div class="sub">' + stk(q.item) + ' · 🎁 🪙 ' + q.coins + " · +" + q.xp + " XP</div></div>" +
        '<div class="right"><button class="btn go sm" data-act="quest" data-arg="' + i + '"' +
        (can ? "" : " disabled") + ">" + esc(MG.i18n.t("deliver")) + "</button></div></div>";
    });
    return h;
  }

  /* ======================================================================
   *  LIVE PATCH — cheap per-frame update of volatile bits.
   * ==================================================================== */
  function patch() {
    var cells = world.querySelectorAll("[data-plotcell]");
    for (var ci = 0; ci < cells.length; ci++) {
      var cell = cells[ci];
      var i = +cell.getAttribute("data-plotcell");
      if (i >= state.unlocked) continue;
      var p = state.plots[i];
      if (cell.classList.contains("locked")) continue;
      var spr = cell.querySelector(".sprite");
      var bar = cell.querySelector(".bar > i");
      if (!p.crop) { if (spr && spr.textContent) spr.textContent = ""; cell.className = "plot empty"; if (bar) bar.style.width = "0%"; continue; }
      var c = CROP_BY_ID[p.crop];
      var rdy = p.grown >= c.grow;
      var cls = "plot" + (rdy ? " ready" : (p.water > 0 ? " watered" : "")) + (p.fert ? " fert" : "");
      if (cell.className !== cls) cell.className = cls;
      var s = plotSprite(p); if (spr && spr.textContent !== s) spr.textContent = s;
      if (bar) bar.style.width = Math.min(100, (p.grown / c.grow) * 100).toFixed(1) + "%";
    }
    if (state.tab === "cook") {
      state.cooks.forEach(function (c, i) {
        if (!c) return;
        var def = DISH_BY_ID[c.dish];
        var total = c.total || def.cook;
        var left = Math.max(0, c.endsAt - Date.now());
        var bar = overlay.querySelector('[data-cbar="' + i + '"] > i');
        if (bar) bar.style.width = Math.min(100, ((total - left) / total) * 100).toFixed(1) + "%";
      });
    } else if (state.tab === "greenhouse") {
      state.pots.forEach(function (p, i) {
        if (!p) return;
        var def = FLOWER_BY_ID[p.flower];
        var total = p.total || def.grow;
        var left = Math.max(0, p.endsAt - Date.now());
        var bar = overlay.querySelector('[data-potbar="' + i + '"] > i');
        if (bar) bar.style.width = Math.min(100, ((total - left) / total) * 100).toFixed(1) + "%";
      });
    } else if (state.tab === "apiary") {
      state.hives.forEach(function (hv, i) {
        var bar = overlay.querySelector('[data-hivebar="' + i + '"] > i');
        if (bar) bar.style.width = Math.min(100, (hv.grown / HIVE_MS) * 100).toFixed(1) + "%";
      });
    }
  }

  // Refresh one animal cell's look in place during a pen sweep.
  function updateAnimCell(el, i) {
    var a = state.animals[i]; if (!a) return;
    var def = ANIMAL_BY_ID[a.type];
    var rdy = a.grown >= def.interval;
    var fed = Date.now() < a.feedUntil;
    el.className = "an" + (rdy ? " rdy" : (fed ? " fed" : " hungry"));
    if (!rdy) { var prod = el.querySelector(".prod"); if (prod) prod.parentNode.removeChild(prod); }
  }

  // ---- Expose ----
  Farm.toast = toast;
  Farm.syncStats = syncStats;
  Farm.render = render;
  Farm.patch = patch;
  Farm.readyCounts = readyCounts;
  Farm.updateAnimCell = updateAnimCell;
})(window.Farm);

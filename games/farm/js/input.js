/* ============================================================================
 *  Farm — the world-view controller (scale, pan & input).
 *
 *  Keeps the world scaled to cover the viewport and lets the player drag it
 *  around. Owns the pointer pipeline: a press on open land pans; a press on a
 *  field tile or a pen animal starts a hold-and-sweep "paint" gesture that
 *  tends each cell entered. Also delegates taps to `handle()` (the action
 *  layer) and shows the one-time "drag to look around" hint.
 * ========================================================================== */
(function (Farm) {
  "use strict";

  var WORLD_W = Farm.WORLD_W, WORLD_H = Farm.WORLD_H;
  // Functions from earlier files (view / actions).
  var render = Farm.render, save = Farm.save, markDirty = Farm.markDirty, handle = Farm.handle,
      freshAgg = Farm.freshAgg, actPlot = Farm.actPlot, actAnimal = Farm.actAnimal, flushAgg = Farm.flushAgg,
      patch = Farm.patch, syncStats = Farm.syncStats, updateAnimCell = Farm.updateAnimCell;

  // Live state + DOM refs, bound at boot (then listeners are wired up).
  var state, worldView, world, toolbarEl, overlay, panHint;

  /* ======================================================================
   *  PAN / SCALE — keep the world covering the viewport, allow dragging.
   * ==================================================================== */
  var tx = 0, ty = 0, scale = 1, scaledW = 0, scaledH = 0, centered = false;

  function ensureScale() {
    var vw = worldView.clientWidth, vh = worldView.clientHeight;
    if (!vw || !vh) return;
    scale = Math.max(vw / WORLD_W, vh / WORLD_H);
    scaledW = WORLD_W * scale;
    scaledH = WORLD_H * scale;
    if (!centered) { tx = (vw - scaledW) / 2; ty = (vh - scaledH) / 2; centered = true; }
    clampPan();
  }
  function clampPan() {
    var vw = worldView.clientWidth, vh = worldView.clientHeight;
    // Reserve room at the bottom for the floating toolbar so the lowest
    // crop tiles and pens can always be panned out from under it.
    var inset = toolbarEl ? toolbarEl.offsetHeight : 0;
    var minX = vw - scaledW, minY = vh - scaledH - inset;
    if (tx > 0) tx = 0; if (tx < minX) tx = minX;
    if (ty > 0) ty = 0; if (ty < minY) ty = minY;
  }
  function applyWorld() {
    world.style.width = scaledW + "px";
    world.style.height = scaledH + "px";
    world.style.transform = "translate(" + Math.round(tx) + "px," + Math.round(ty) + "px)";
  }

  /* ======================================================================
   *  PANNING (pointer) + CLICK DELEGATION
   * ==================================================================== */
  var panId = null, panStartX = 0, panStartY = 0, panTx0 = 0, panTy0 = 0, dragging = false, suppressClick = false;

  // A "paint" gesture: holding on a field tile or an animal and sweeping
  // across more of them performs the action on each one entered — no
  // per-tile clicking. Pressing on open land pans the map as before.
  var paintMode = null, paintId = null, paintVisited = null, paintAgg = null;
  // A pen press waits to see what it is: a tap opens that pen's panel, a
  // sweep tends the animals by hand. We don't act until movement crosses a
  // small threshold, so a clean tap never collects/feeds by accident.
  var penGesture = null;

  // Whether the player is mid-pan or mid-sweep — the tick loop uses this to
  // hold off full re-renders so the gesture stays smooth.
  function isInteracting() { return dragging || paintMode !== null; }

  function startPaint(mode, e) {
    paintMode = mode;
    paintId = e.pointerId;
    paintVisited = {};
    paintAgg = freshAgg();
    try { worldView.setPointerCapture(paintId); } catch (err) {}
    hidePanHint();
  }
  // Act on whatever interactive cell sits under the pointer, once per cell.
  function paintAt(cx, cy) {
    var el = document.elementFromPoint(cx, cy);
    if (!el || !el.closest) return;
    if (paintMode === "field") {
      var cell = el.closest("[data-plotcell]");
      if (!cell || cell.getAttribute("data-act") !== "plot") return;
      var i = +cell.getAttribute("data-plotcell");
      if (paintVisited["f" + i]) return;
      paintVisited["f" + i] = true;
      if (actPlot(i, paintAgg)) { patch(); syncStats(); }
    } else if (paintMode === "pen") {
      var ac = el.closest("[data-animcell]");
      if (!ac) return;
      var j = +ac.getAttribute("data-animcell");
      if (paintVisited["a" + j]) return;
      paintVisited["a" + j] = true;
      if (actAnimal(j, paintAgg)) { updateAnimCell(ac, j); syncStats(); }
    }
  }
  function endPaint() {
    if (paintMode === null) return;
    var agg = paintAgg, mode = paintMode, pg = penGesture;
    paintMode = null; paintId = null; paintVisited = null; paintAgg = null; penGesture = null;
    suppressClick = true; setTimeout(function () { suppressClick = false; }, 0);
    // A pen press that never moved is a tap → open that pen's panel.
    if (mode === "pen" && pg && !pg.moved) {
      if (pg.type) { state.tab = "pen"; state.penType = pg.type; markDirty(); render(); }
      return;
    }
    flushAgg(agg);
    save(); render();
  }

  function onPointerDown(e) {
    if (e.target.closest && e.target.closest("#toolbar")) return; // let the toolbar scroll/tap
    var plotCell = e.target.closest && e.target.closest("[data-plotcell]");
    var animCell = e.target.closest && e.target.closest("[data-animcell]");
    if (plotCell && plotCell.getAttribute("data-act") === "plot") {
      startPaint("field", e); paintAt(e.clientX, e.clientY); return;
    }
    if (animCell) {
      var aIdx = +animCell.getAttribute("data-animcell");
      var animal = state.animals[aIdx];
      penGesture = { type: animal ? animal.type : null, x: e.clientX, y: e.clientY, moved: false };
      startPaint("pen", e); // defer: act only once a sweep is detected
      return;
    }
    panId = e.pointerId;
    panStartX = e.clientX; panStartY = e.clientY;
    panTx0 = tx; panTy0 = ty; dragging = false;
  }
  function onPointerMove(e) {
    if (paintMode !== null && e.pointerId === paintId) {
      if (paintMode === "pen" && penGesture && !penGesture.moved) {
        if (Math.abs(e.clientX - penGesture.x) + Math.abs(e.clientY - penGesture.y) <= 6) return;
        penGesture.moved = true;
        paintAt(penGesture.x, penGesture.y); // tend the cell the press started on
      }
      paintAt(e.clientX, e.clientY);
      return;
    }
    if (panId === null || e.pointerId !== panId) return;
    var dx = e.clientX - panStartX, dy = e.clientY - panStartY;
    if (!dragging && Math.abs(dx) + Math.abs(dy) > 6) {
      dragging = true;
      worldView.classList.add("drag");
      try { worldView.setPointerCapture(panId); } catch (err) {}
      hidePanHint();
    }
    if (dragging) {
      tx = panTx0 + dx; ty = panTy0 + dy;
      clampPan();
      world.style.transform = "translate(" + Math.round(tx) + "px," + Math.round(ty) + "px)";
    }
  }
  function endPan() {
    if (panId === null) return;
    if (dragging) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 0); }
    worldView.classList.remove("drag");
    panId = null; dragging = false;
  }

  function onWorldClick(e) {
    if (suppressClick) return;
    var t = e.target;
    while (t && t !== worldView && !t.dataset.act) t = t.parentNode;
    if (!t || t === worldView) return;
    handle(t.dataset.act, t.dataset.arg);
  }
  function onOverlayClick(e) {
    if (e.target === overlay) { handle("close"); return; }
    var t = e.target;
    while (t && t !== overlay && !t.dataset.act) t = t.parentNode;
    if (!t || t === overlay) return;
    handle(t.dataset.act, t.dataset.arg);
  }

  /* ---- One-time "drag to look around" hint. ---- */
  var hintTimer = null;
  function hidePanHint() { panHint.classList.remove("show"); if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; } }
  function showPanHint() {
    panHint.textContent = MG.i18n.t("dragHint");
    panHint.classList.add("show");
    hintTimer = setTimeout(hidePanHint, 4000);
  }

  Farm.ready(function () {
    state = Farm.state;
    worldView = Farm.dom.worldView;
    world = Farm.dom.world;
    toolbarEl = Farm.dom.toolbar;
    overlay = Farm.dom.overlay;
    panHint = Farm.dom.panHint;

    worldView.addEventListener("pointerdown", onPointerDown);
    worldView.addEventListener("pointermove", onPointerMove);
    worldView.addEventListener("pointerup", function () { endPaint(); endPan(); });
    worldView.addEventListener("pointercancel", function () { endPaint(); endPan(); });
    worldView.addEventListener("click", onWorldClick);
    overlay.addEventListener("click", onOverlayClick);
  });

  // ---- Expose ----
  Farm.ensureScale = ensureScale;
  Farm.clampPan = clampPan;
  Farm.applyWorld = applyWorld;
  Farm.isInteracting = isInteracting;
  Farm.showPanHint = showPanHint;
  Farm.hidePanHint = hidePanHint;
})(window.Farm);

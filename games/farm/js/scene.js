/* ============================================================================
 *  Farm — the world scene (geometry & SVG drawing).
 *
 *  The scene is drawn in a viewBox of WORLD_W × WORLD_H units; the .world
 *  element is rendered at those units × the cover scale, and panned with a
 *  transform. Interactive overlays (plots, pens, building signs) are
 *  positioned by the view layer as a percentage of WORLD_W / WORLD_H so they
 *  always sit over their drawing.
 *
 *  Everything here is pure: it produces SVG markup and layout constants from
 *  fixed inputs, with no game state involved.
 * ========================================================================== */
(function (Farm) {
  "use strict";

  var WORLD_W = 1200, WORLD_H = 1080;

  // Interactive buildings. (cx, by) = front-bottom-center; w = footprint.
  var BLD = {
    market: { act: "market", ico: "🏪", cx: 250, by: 380, w: 150, roof: "#d8503f", roof2: "#b53c2d", wall: "#fbe6c9", wall2: "#e3cd9f" },
    cook:   { act: "cook",   ico: "🍞", cx: 950, by: 380, w: 140, roof: "#e0962f", roof2: "#bf7c20", wall: "#fdeccb", wall2: "#ecd6a4" },
    greenhouse: { act: "greenhouse", ico: "🌻", cx: 958, by: 588, w: 116, roof: "#7fc3a0", roof2: "#5fa483", wall: "#e7f6ee", wall2: "#c8e6d6" },
    apiary: { act: "apiary", ico: "🐝", cx: 600, by: 1034, w: 120, roof: "#e0a82f", roof2: "#bf8a20", wall: "#fff0c4", wall2: "#ecd59a" },
    quests: { act: "quests", ico: "🪧", cx: 955, by: 790, w: 130, roof: "#5f8a37", roof2: "#4c7029", wall: "#f3e7c6", wall2: "#dccaa0" }
  };
  // Decorative cottages dotted around the back — just village flavour.
  var DECO = [
    { cx: 560, by: 250, w: 96,  roof: "#c77b3a", roof2: "#a8632b", wall: "#f3e3c0", wall2: "#ddc89c" },
    { cx: 770, by: 228, w: 72,  roof: "#7d96c0", roof2: "#6076a0", wall: "#eef0f4", wall2: "#d3d8e2" },
    { cx: 420, by: 236, w: 80,  roof: "#6f9b46", roof2: "#577a35", wall: "#f3e3c0", wall2: "#ddc89c" }
  ];
  // One fenced pen per animal type, lined up across the front of the scene.
  // Each pen holds only its own kind of animal: tap it to manage the pen,
  // or hold-and-sweep across the animals to collect / feed out on the map.
  var PEN_DEFS = [
    { type: "chicken", L: 400, R: 508, T: 745, B: 880 },
    { type: "cow",     L: 520, R: 628, T: 745, B: 880 },
    { type: "sheep",   L: 640, R: 748, T: 745, B: 880 },
    { type: "pig",     L: 760, R: 868, T: 745, B: 880 }
  ];

  // The crop field: a 5×5 grid of tilled tiles centred on the map.
  var FIELD = { cols: 5, rows: 5, tile: 72, gap: 14, cx: 600, cy: 500 };
  FIELD.fullW = FIELD.cols * FIELD.tile + (FIELD.cols - 1) * FIELD.gap;
  FIELD.fullH = FIELD.rows * FIELD.tile + (FIELD.rows - 1) * FIELD.gap;
  FIELD.startX = FIELD.cx - FIELD.fullW / 2;
  FIELD.startY = FIELD.cy - FIELD.fullH / 2;
  function plotPos(i) {
    var col = i % FIELD.cols, row = Math.floor(i / FIELD.cols);
    return { x: FIELD.startX + col * (FIELD.tile + FIELD.gap), y: FIELD.startY + row * (FIELD.tile + FIELD.gap) };
  }

  function nf(n) { return Math.round(n * 10) / 10; }
  function pf(n) { return Math.round(n * 100) / 100; }

  function geom(b) {
    var w = b.w, cx = b.cx, by = b.by;
    var wh = w * 0.5, rh = w * 0.42, d = w * 0.3, e = w * 0.1, dx = d, dy = -d * 0.5;
    var L = cx - w / 2, R = cx + w / 2, top = by - wh, ridge = top - rh;
    return {
      w: w, cx: cx, by: by, wh: wh, rh: rh, d: d, e: e, dx: dx, dy: dy,
      L: L, R: R, top: top, ridge: ridge,
      minX: L - e, maxX: R + e + dx, minY: ridge + dy, maxY: by
    };
  }

  function svgWindow(x, y, s) {
    return '<rect x="' + nf(x) + '" y="' + nf(y) + '" width="' + nf(s) + '" height="' + nf(s * 0.9) +
      '" rx="' + nf(s * 0.12) + '" fill="rgba(150,210,255,0.85)" stroke="rgba(255,255,255,0.6)" stroke-width="' + nf(s * 0.1) + '"/>';
  }

  // A fake-3D gabled cottage: ground shadow, shaded right face, a front
  // wall (door + windows) and a pitched roof with a lit ridge.
  function svgHouse(b) {
    var g = geom(b), s = "";
    s += '<ellipse cx="' + nf(b.cx + g.dx * 0.4) + '" cy="' + nf(b.by + g.w * 0.02) +
      '" rx="' + nf(g.w * 0.66) + '" ry="' + nf(g.w * 0.15) + '" fill="rgba(0,0,0,0.16)"/>';
    s += '<path d="M' + nf(g.R) + ' ' + nf(g.top) + ' L' + nf(g.R + g.dx) + ' ' + nf(g.top + g.dy) +
      ' L' + nf(g.R + g.dx) + ' ' + nf(g.by + g.dy) + ' L' + nf(g.R) + ' ' + nf(g.by) + 'Z" fill="' + b.wall2 + '"/>';
    s += '<rect x="' + nf(g.L) + '" y="' + nf(g.top) + '" width="' + nf(g.w) + '" height="' + nf(g.wh) + '" fill="' + b.wall + '"/>';
    s += '<rect x="' + nf(g.L) + '" y="' + nf(g.by - g.wh * 0.13) + '" width="' + nf(g.w) + '" height="' + nf(g.wh * 0.13) + '" fill="rgba(0,0,0,0.1)"/>';
    var ww = g.w * 0.16, wy = g.top + g.wh * 0.22;
    s += svgWindow(g.L + g.w * 0.13, wy, ww) + svgWindow(g.R - g.w * 0.13 - ww, wy, ww);
    var dw = g.w * 0.2, dh = g.wh * 0.5;
    s += '<rect x="' + nf(b.cx - dw / 2) + '" y="' + nf(g.by - dh) + '" width="' + nf(dw) + '" height="' + nf(dh) +
      '" rx="' + nf(dw * 0.28) + '" fill="rgba(86,52,24,0.6)"/>';
    s += '<path d="M' + nf(b.cx) + ' ' + nf(g.ridge) + ' L' + nf(b.cx + g.dx) + ' ' + nf(g.ridge + g.dy) +
      ' L' + nf(g.R + g.e + g.dx) + ' ' + nf(g.top + g.dy) + ' L' + nf(g.R + g.e) + ' ' + nf(g.top) + 'Z" fill="' + b.roof2 + '"/>';
    s += '<path d="M' + nf(g.L - g.e) + ' ' + nf(g.top) + ' L' + nf(b.cx) + ' ' + nf(g.ridge) +
      ' L' + nf(g.R + g.e) + ' ' + nf(g.top) + 'Z" fill="' + b.roof + '"/>';
    s += '<path d="M' + nf(b.cx) + ' ' + nf(g.ridge) + ' L' + nf(b.cx + g.dx) + ' ' + nf(g.ridge + g.dy) +
      '" stroke="rgba(255,255,255,0.4)" stroke-width="' + nf(g.w * 0.03) + '" stroke-linecap="round"/>';
    return s;
  }

  function svgTree(x, y, r) {
    return '<ellipse cx="' + nf(x) + '" cy="' + nf(y + r * 0.1) + '" rx="' + nf(r * 1.05) + '" ry="' + nf(r * 0.32) + '" fill="rgba(0,0,0,0.15)"/>' +
      '<rect x="' + nf(x - r * 0.16) + '" y="' + nf(y - r * 0.7) + '" width="' + nf(r * 0.32) + '" height="' + nf(r * 0.9) + '" rx="' + nf(r * 0.12) + '" fill="#8a5a32"/>' +
      '<circle cx="' + nf(x) + '" cy="' + nf(y - r * 1.05) + '" r="' + nf(r * 0.95) + '" fill="#4e9b3f"/>' +
      '<circle cx="' + nf(x - r * 0.45) + '" cy="' + nf(y - r * 0.75) + '" r="' + nf(r * 0.62) + '" fill="#57a948"/>' +
      '<circle cx="' + nf(x + r * 0.45) + '" cy="' + nf(y - r * 0.8) + '" r="' + nf(r * 0.6) + '" fill="#458a39"/>' +
      '<circle cx="' + nf(x - r * 0.3) + '" cy="' + nf(y - r * 1.35) + '" r="' + nf(r * 0.4) + '" fill="#67bd55"/>';
  }

  function svgCloud(x, y, sc) {
    var r = 8 * sc;
    return '<g fill="rgba(255,255,255,0.92)">' +
      '<ellipse cx="' + nf(x) + '" cy="' + nf(y) + '" rx="' + nf(r * 1.6) + '" ry="' + nf(r * 0.7) + '"/>' +
      '<circle cx="' + nf(x - r) + '" cy="' + nf(y) + '" r="' + nf(r * 0.8) + '"/>' +
      '<circle cx="' + nf(x + r) + '" cy="' + nf(y - r * 0.2) + '" r="' + nf(r * 0.9) + '"/>' +
      '<circle cx="' + nf(x) + '" cy="' + nf(y - r * 0.5) + '" r="' + nf(r) + '"/></g>';
  }

  function svgPond(cx, cy, rx, ry) {
    return '<ellipse cx="' + nf(cx) + '" cy="' + nf(cy + ry * 0.18) + '" rx="' + nf(rx * 1.05) + '" ry="' + nf(ry * 1.05) + '" fill="rgba(0,0,0,0.12)"/>' +
      '<ellipse cx="' + nf(cx) + '" cy="' + nf(cy) + '" rx="' + nf(rx) + '" ry="' + nf(ry) + '" fill="url(#pond)"/>' +
      '<ellipse cx="' + nf(cx - rx * 0.25) + '" cy="' + nf(cy - ry * 0.3) + '" rx="' + nf(rx * 0.4) + '" ry="' + nf(ry * 0.3) + '" fill="rgba(255,255,255,0.4)"/>';
  }

  function svgField(cx, cy, w, h, rot) {
    var x = cx - w / 2, y = cy - h / 2;
    return '<g transform="rotate(' + rot + ' ' + nf(cx) + ' ' + nf(cy) + ')">' +
      '<rect x="' + nf(x - 6) + '" y="' + nf(y - 6) + '" width="' + nf(w + 12) + '" height="' + nf(h + 12) + '" rx="10" fill="#6f9c45"/>' +
      '<rect x="' + nf(x) + '" y="' + nf(y) + '" width="' + nf(w) + '" height="' + nf(h) + '" rx="6" fill="url(#furrow)"/>' +
      '</g>';
  }

  function svgFence(x1, x2, y) {
    var s = '<line x1="' + nf(x1) + '" y1="' + nf(y) + '" x2="' + nf(x2) + '" y2="' + nf(y) + '" stroke="#c9a26a" stroke-width="5"/>' +
      '<line x1="' + nf(x1) + '" y1="' + nf(y - 9) + '" x2="' + nf(x2) + '" y2="' + nf(y - 9) + '" stroke="#dab57e" stroke-width="4"/>';
    for (var x = x1; x <= x2 + 0.1; x += 30) s += '<rect x="' + nf(x - 2.5) + '" y="' + nf(y - 16) + '" width="5" height="23" rx="2" fill="#b98e58"/>';
    return s;
  }

  function svgPenRect(L, R, T, B) {
    var s = '<rect x="' + nf(L) + '" y="' + nf(T) + '" width="' + nf(R - L) + '" height="' + nf(B - T) + '" rx="14" fill="#a9d57e"/>' +
      '<rect x="' + nf(L) + '" y="' + nf(T) + '" width="' + nf(R - L) + '" height="' + nf(B - T) + '" rx="14" fill="url(#pengrass)"/>';
    s += svgFence(L, R, T + 6) + svgFence(L, R, B - 2);
    s += '<rect x="' + nf(L - 2.5) + '" y="' + nf(T - 10) + '" width="5" height="' + nf(B - T + 14) + '" rx="2" fill="#b98e58"/>';
    s += '<rect x="' + nf(R - 2.5) + '" y="' + nf(T - 10) + '" width="5" height="' + nf(B - T + 14) + '" rx="2" fill="#b98e58"/>';
    return s;
  }
  function svgPens() {
    var s = "";
    PEN_DEFS.forEach(function (pn) { s += svgPenRect(pn.L, pn.R, pn.T, pn.B); });
    return s;
  }

  // The tilled backing + fence behind the playable crop grid.
  function svgFieldBacking() {
    var x = FIELD.startX - 24, y = FIELD.startY - 24;
    var w = FIELD.fullW + 48, h = FIELD.fullH + 48;
    var s = '<rect x="' + nf(x - 4) + '" y="' + nf(y - 4) + '" width="' + nf(w + 8) + '" height="' + nf(h + 8) + '" rx="20" fill="#6f9c45"/>';
    s += '<rect x="' + nf(x) + '" y="' + nf(y) + '" width="' + nf(w) + '" height="' + nf(h) + '" rx="14" fill="url(#furrow)"/>';
    s += svgFence(x, x + w, y + 4) + svgFence(x, x + w, y + h - 2);
    return s;
  }

  var DEFS = '<defs>' +
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd9ff"/><stop offset="1" stop-color="#d8f1ff"/></linearGradient>' +
    '<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7d977"/><stop offset="1" stop-color="#79b557"/></linearGradient>' +
    '<radialGradient id="pond" cx="0.5" cy="0.35" r="0.75"><stop offset="0" stop-color="#bdeaf6"/><stop offset="1" stop-color="#5fb6d6"/></radialGradient>' +
    '<pattern id="furrow" width="60" height="22" patternUnits="userSpaceOnUse"><rect width="60" height="22" fill="#8a5630"/><rect width="60" height="9" fill="#6a3f1d"/></pattern>' +
    '<pattern id="pengrass" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="9" height="26" fill="rgba(255,255,255,0.14)"/></pattern>' +
    '</defs>';

  var PATH_D = "M600 1082 C 560 940 700 800 600 640 S 500 460 600 320";

  // Compose the whole scene back-to-front (painter's order = depth).
  function buildScene() {
    var s = DEFS;
    // Sky band, sun, clouds along the horizon at the top of the map.
    s += '<rect x="0" y="0" width="' + WORLD_W + '" height="150" fill="url(#sky)"/>';
    s += '<circle cx="120" cy="92" r="44" fill="#ffe27a"/><circle cx="120" cy="92" r="30" fill="#ffd23f"/>';
    s += svgCloud(560, 70, 3.4) + svgCloud(880, 100, 2.6) + svgCloud(330, 110, 2.2) + svgCloud(1080, 60, 2.8);
    // Rolling hills, then the grass that fills the rest of the world.
    s += '<ellipse cx="240" cy="150" rx="420" ry="80" fill="#8fc265"/><ellipse cx="980" cy="156" rx="380" ry="70" fill="#84b95b"/>';
    s += '<rect x="0" y="138" width="' + WORLD_W + '" height="' + (WORLD_H - 138) + '" fill="url(#grass)"/>';
    // A decorative field behind the village, plus back cottages.
    s += svgField(1010, 235, 200, 96, -8) + svgField(180, 470, 150, 80, 6);
    s += svgHouse(DECO[2]) + svgHouse(DECO[0]) + svgHouse(DECO[1]);
    // Winding dirt path threading through the village.
    s += '<path d="' + PATH_D + '" fill="none" stroke="#d8bd86" stroke-width="64" stroke-linecap="round"/>';
    s += '<path d="' + PATH_D + '" fill="none" stroke="#e7d2a4" stroke-width="36" stroke-linecap="round"/>';
    // Pond and some back trees.
    s += svgPond(300, 205, 84, 40);
    s += svgTree(70, 320, 40) + svgTree(1130, 300, 36) + svgTree(720, 300, 30);
    // The playable field backing (tiles are HTML overlays on top).
    s += svgFieldBacking();
    // Interactive buildings — back row, the mid greenhouse, then front row.
    s += svgHouse(BLD.market) + svgHouse(BLD.cook);
    s += svgHouse(BLD.greenhouse);
    s += svgHouse(BLD.quests);
    // The animal pens and a couple of front trees.
    s += svgPens();
    // The apiary sits front-and-centre below the pens.
    s += svgHouse(BLD.apiary);
    s += svgTree(90, 760, 46) + svgTree(1130, 700, 42) + svgTree(1130, 1010, 38) + svgTree(150, 1010, 40);
    return s;
  }

  // ---- Expose ----
  Farm.WORLD_W = WORLD_W;
  Farm.WORLD_H = WORLD_H;
  Farm.BLD = BLD;
  Farm.PEN_DEFS = PEN_DEFS;
  Farm.FIELD = FIELD;
  Farm.plotPos = plotPos;
  Farm.geom = geom;
  Farm.buildScene = buildScene;
  Farm.nf = nf;
  Farm.pf = pf;
})(window.Farm);

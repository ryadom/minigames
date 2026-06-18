/* ============================================================================
 *  Farm — bootstrap & game loop. The single ES module entrypoint.
 *
 *  Imports every module (the bundler follows the graph from here), mounts the
 *  shared header, collects the DOM refs the other modules bind to, installs
 *  the boot runtime, wires input, then starts the real-time tick that advances
 *  crop growth, animal production, cooking, the apiary and the market while
 *  you play. Also wires the page lifecycle (save on hide/leave, rescale on
 *  resize, re-render on language change).
 * ========================================================================== */
import { MG } from "../../../shared/mg";
import {
  $,
  ANIMAL_BY_ID,
  CROP_BY_ID,
  FEED_MS,
  HIVE_MS,
  PROD_BY_ID,
  WATER_BOOST,
  WATER_MS,
} from "./config";
import { addItem, addXp, rollMarket, soilMul, spaceLeft, sprinkleEvery } from "./economy";
// Importing i18n registers the translations as a side effect.
import "./i18n";
import { applyWorld, ensureScale, initInput, isInteracting, showPanHint } from "./input";
import { setRuntime } from "./runtime";
import { isDirty, load, markDirty, reset, save, state } from "./state";
import type { Dom } from "./types";
import { patch, render, syncStats } from "./view";

/* ======================================================================
 *  HEADER + DOM REFS
 * ==================================================================== */
const ui = MG.mountHeader({
  icon: "🚜",
  titleKey: "title",
  stats: [
    { key: "coins", labelKey: "coins", value: 0 },
    { key: "level", labelKey: "level", value: 1 },
  ],
  actions: [
    {
      key: "new",
      labelKey: "newFarm",
      onClick: () => {
        if (window.confirm(MG.i18n.t("confirmReset"))) {
          reset();
          render();
          syncStats();
        }
      },
    },
  ],
});

const dom: Dom = {
  worldView: $("worldView"),
  world: $("world"),
  toolbar: $("toolbar"),
  overlay: $("overlay"),
  toast: $("toast"),
  panHint: $("panHint"),
  lvl: $("lvl"),
  xpfill: $("xpfill"),
  store: $("store"),
};

// Install the shared boot runtime, then wire the input controller.
setRuntime(ui, dom);
initInput();

/* ======================================================================
 *  TICK — advance growth / production / cooking in real time
 * ==================================================================== */
let last = performance.now();
let patchAccum = 0;
let saveAccum = 0;
let viewAccum = 0;
let sprinkleAccum = 0;

function tick(now: number): void {
  let dt = now - last;
  last = now;
  if (dt > 2000) dt = 2000;

  // The sprinkler periodically re-waters every dry, still-growing plot.
  if (state.sprinkler > 0) {
    sprinkleAccum += dt;
    if (sprinkleAccum >= sprinkleEvery()) {
      sprinkleAccum = 0;
      for (const sp of state.grid) {
        if (
          sp &&
          sp.kind === "soil" &&
          sp.crop &&
          (sp.water || 0) <= 0 &&
          (sp.grown || 0) < CROP_BY_ID[sp.crop].grow
        ) {
          sp.water = WATER_MS;
          markDirty();
        }
      }
    }
  }

  const gmul = soilMul();
  for (const p of state.grid) {
    if (p?.kind !== "soil" || !p.crop) continue;
    const c = CROP_BY_ID[p.crop];
    const grown = p.grown || 0;
    if (grown >= c.grow) continue;
    let speed = gmul;
    if ((p.water || 0) > 0) {
      speed = WATER_BOOST * gmul;
      p.water = Math.max(0, (p.water || 0) - dt);
      if (p.water === 0) markDirty();
    }
    p.grown = Math.min(c.grow, grown + dt * speed);
    if (grown < c.grow && p.grown >= c.grow) markDirty();
  }
  const nowMs = Date.now();
  state.animals.forEach((a) => {
    const def = ANIMAL_BY_ID[a.type];
    const pen = state.pens[a.type];
    // A feeder keeps the animal fed on its own, spending one feed each cycle.
    if (pen?.feeder && nowMs >= a.feedUntil && pen.feed > 0) {
      pen.feed -= 1;
      a.feedUntil = nowMs + FEED_MS;
      markDirty();
    }
    if (a.grown < def.interval) {
      if (nowMs < a.feedUntil) {
        const before = a.grown;
        a.grown = Math.min(def.interval, a.grown + dt);
        if (before < def.interval && a.grown >= def.interval) markDirty();
      }
    } else if (pen?.collector && spaceLeft() >= 1) {
      // A collector gathers ripe produce into storage automatically.
      addItem(def.prod, 1);
      addXp(PROD_BY_ID[def.prod]?.xp || 0);
      a.grown = 0;
      markDirty();
    }
  });
  // Hives quietly fill with honey — no feeding required.
  state.hives.forEach((hv) => {
    if (hv.grown >= HIVE_MS) return;
    const before = hv.grown;
    hv.grown = Math.min(HIVE_MS, hv.grown + dt);
    if (before < HIVE_MS && hv.grown >= HIVE_MS) markDirty();
  });
  if (nowMs >= state.marketUntil) rollMarket(state, false);

  patchAccum += dt;
  if (patchAccum > 200) {
    patch();
    patchAccum = 0;
  }

  // A full (pan-preserving) re-render once a second keeps building status
  // lines, badges, countdowns and re-rolled prices honest. Skip it while
  // the player is actively dragging so the pan stays buttery.
  viewAccum += dt;
  if (viewAccum > 1000) {
    viewAccum = 0;
    if (!isInteracting()) render();
  }

  saveAccum += dt;
  if (isDirty() && saveAccum > 1500) {
    save();
    saveAccum = 0;
  }

  requestAnimationFrame(tick);
}

// Persist on leave.
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") save();
});

// Keep the world covering the viewport as it resizes / rotates.
window.addEventListener("resize", () => {
  ensureScale();
  applyWorld();
});

// Re-localize live.
MG.i18n.onChange(() => {
  render();
});

/* ============================ Boot ============================ */
load();
render();
syncStats();
showPanHint();
requestAnimationFrame(tick);

/* ============================================================================
 *  Asteroid Colony — boot, real-time tick loop and page lifecycle.
 *
 *  Wires the canvas renderer, pointer input and DOM chrome together, runs the
 *  fixed-step simulation via a requestAnimationFrame loop, and saves on hide.
 * ========================================================================== */
import "./i18n";
import { initInput } from "./input";
import { draw, ensureScale, initRender, resizeCanvas } from "./render";
import { advance } from "./sim";
import { isDirty, livingDupes, load, reset, save, state } from "./state";
import { hideOverlay, initView, showGameOver, showStart, syncStats } from "./view";

const canvas = document.getElementById("game") as HTMLCanvasElement;
initRender(canvas);
initInput(canvas);

load();
initView({ onStart: startGame });
resizeCanvas();
ensureScale();
syncStats();

let running = false;
showStart();

function startGame(): void {
  if (livingDupes() === 0) reset();
  running = true;
  syncStats();
}

let last = performance.now();
let statAcc = 0;
let saveAcc = 0;

function tick(now: number): void {
  let dt = now - last;
  last = now;
  if (dt > 2000) dt = 2000; // clamp big jumps (tab was hidden)

  if (running) advance(dt);
  draw();

  statAcc += dt;
  if (statAcc > 250) {
    syncStats();
    statAcc = 0;
  }

  saveAcc += dt;
  if (isDirty() && saveAcc > 1500) {
    save();
    saveAcc = 0;
  }

  if (running && livingDupes() === 0) {
    running = false;
    state.lastSeen = Date.now();
    save();
    showGameOver();
  }

  requestAnimationFrame(tick);
}

window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") save();
});
window.addEventListener("resize", () => {
  resizeCanvas();
  ensureScale();
});

void hideOverlay;
requestAnimationFrame(tick);

import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";

interface Vec {
  x: number;
  y: number;
}

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "Snake",
    score: "Score",
    best: "Best",
    hint: "Arrow keys, WASD or swipe to steer",
    gameover: "Game Over",
    scoreLabel: "Score",
    bestLabel: "Best",
    play: "▶ Play",
    playAgain: "▶ Play again",
  },
  ru: {
    title: "Змейка",
    score: "Счёт",
    best: "Рекорд",
    hint: "Стрелки, WASD или свайп — поворот",
    gameover: "Игра окончена",
    scoreLabel: "Счёт",
    bestLabel: "Рекорд",
    play: "▶ Играть",
    playAgain: "▶ Ещё раз",
  },
  es: {
    title: "Serpiente",
    score: "Puntos",
    best: "Mejor",
    hint: "Flechas, WASD o desliza para girar",
    gameover: "Fin del juego",
    scoreLabel: "Puntos",
    bestLabel: "Mejor",
    play: "▶ Jugar",
    playAgain: "▶ Jugar otra vez",
  },
});

const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const overlay = $("overlay");
const overlayTitle = $("overlay-title");
const overlayHint = $("overlay-hint");
const overlayScore = $("overlay-score") as HTMLDivElement;
const overlayAction = $("overlay-action");

// Shared header: brand + language selector + Score and Best stat chips.
const ui: HeaderUI = MG.mountHeader({
  icon: "🐍",
  titleKey: "title",
  stats: [
    { key: "score", labelKey: "score", value: 0 },
    { key: "best", labelKey: "best" },
  ],
});

// --- Grid configuration ---
// The world is a square grid of GRID×GRID cells. The canvas is drawn at
// a logical pixel size and scaled to fit the (square) stage.
const GRID = 17;
const cell = 24; // logical px per cell (recomputed on resize)
const W = GRID * cell;
const _H = GRID * cell;
let viewScale = 1;

// High-DPI sizing — size the stage to the largest square that fits the
// available area (so cells are always square), then back the canvas with
// a matching device-pixel buffer.
const stage = canvas.parentNode as HTMLElement;
function resize(): void {
  const area = stage.parentNode as HTMLElement; // .mg-game-area
  const pad = 12; // matches .mg-game-area padding
  const availW = Math.max(1, area.clientWidth - pad * 2);
  const availH = Math.max(1, area.clientHeight - pad * 2);
  const size = Math.max(1, Math.floor(Math.min(availW, availH, 480)));

  stage.style.width = `${size}px`;
  stage.style.height = `${size}px`;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  viewScale = (size / W) * dpr;
}

// --- Speed (ms per step) — starts gentle, ramps up as the snake grows ---
const STEP_START = 150;
const STEP_MIN = 70;
const STEP_RAMP = 4; // ms faster per apple eaten

// --- State ---
const STATE_READY = 0;
const STATE_PLAY = 1;
const STATE_DEAD = 2;
let state = STATE_READY;

let snake: Vec[];
let dir: Vec;
let nextDir: Vec;
let food: Vec | null;
let score: number;
let best: number;
let stepMs: number;
let acc: number;
let lastTime: number;
let growBy: number;

// Shared versioned save store (see MG.storage in shared/mg.js).
const store = MG.storage<{ best: number }>("snake", { version: 1 });
best = (store.load() || { best: 0 }).best;
ui.setStat("best", best);

function reset(): void {
  const mid = (GRID / 2) | 0;
  snake = [
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
    { x: mid - 3, y: mid },
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  growBy = 0;
  stepMs = STEP_START;
  acc = 0;
  lastTime = 0;
  ui.setStat("score", 0);
  placeFood();
}

// Place food on a random free cell.
function placeFood(): void {
  const free: Vec[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!occupied(x, y)) free.push({ x: x, y: y });
    }
  }
  if (!free.length) {
    food = null;
    return;
  } // board full — win-ish
  food = free[(Math.random() * free.length) | 0];
}

function occupied(x: number, y: number): boolean {
  for (let i = 0; i < snake.length; i++) {
    if (snake[i].x === x && snake[i].y === y) return true;
  }
  return false;
}

// --- Input: queue a turn (can't reverse straight back). ---
function setDir(x: number, y: number): void {
  if (state === STATE_READY) startGame();
  if (state !== STATE_PLAY) return;
  // Disallow reversing onto the neck.
  if (x === -dir.x && y === -dir.y) return;
  nextDir = { x: x, y: y };
}

function startGame(): void {
  reset();
  state = STATE_PLAY;
  overlay.classList.add("hidden");
}

function showReady(): void {
  reset();
  state = STATE_READY;
  overlay.classList.remove("hidden");
  renderOverlay();
}

function die(): void {
  state = STATE_DEAD;
  if (score > best) {
    best = score;
    store.save({ best: best });
    ui.setStat("best", best);
  }
  showGameOver();
}

function showGameOver(): void {
  overlay.classList.remove("hidden");
  renderOverlay();
}

// Render overlay text for the current state in the current language.
function renderOverlay(): void {
  const t = MG.i18n.t;
  if (state === STATE_DEAD) {
    overlayTitle.textContent = `🐍 ${t("title")}`;
    overlayHint.textContent = t("gameover");
    overlayScore.hidden = false;
    overlayScore.innerHTML = `${t("scoreLabel")} <b>${score}</b><br>${t("bestLabel")} <b>${best}</b>`;
    overlayAction.textContent = t("playAgain");
  } else {
    overlayTitle.textContent = `🐍 ${t("title")}`;
    overlayHint.textContent = t("hint");
    overlayScore.hidden = true;
    overlayAction.textContent = t("play");
  }
}
MG.i18n.onChange(() => {
  if (!overlay.classList.contains("hidden")) renderOverlay();
});

// Briefly flash a stat chip's value (e.g. when the score ticks up).
function flashStat(key: string): void {
  const e = ui.stat(key);
  if (!e) return;
  e.classList.remove("mg-flash");
  void e.offsetWidth;
  e.classList.add("mg-flash");
}

// --- Step the simulation by one grid move. ---
function step(): void {
  dir = nextDir;
  const head = snake[0];
  const nx = head.x + dir.x;
  const ny = head.y + dir.y;

  // Walls.
  if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
    die();
    return;
  }
  // Self bite — ignore the tail cell, which is about to move away
  // (unless we're growing this step).
  for (let i = 0; i < snake.length; i++) {
    if (i === snake.length - 1 && growBy === 0) break;
    if (snake[i].x === nx && snake[i].y === ny) {
      die();
      return;
    }
  }

  snake.unshift({ x: nx, y: ny });

  if (food && nx === food.x && ny === food.y) {
    score++;
    growBy += 1;
    ui.setStat("score", score);
    flashStat("score");
    stepMs = Math.max(STEP_MIN, STEP_START - score * STEP_RAMP);
    placeFood();
  }

  if (growBy > 0) {
    growBy--;
  } else {
    snake.pop();
  }
}

// --- Render ---
function draw(): void {
  ctx.save();
  ctx.scale(viewScale, viewScale);

  // Board: subtle checkerboard.
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#2a3142" : "#252b3a";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // Food (apple).
  if (food) drawFood(food.x, food.y);

  // Snake.
  for (let i = snake.length - 1; i >= 0; i--) {
    drawSegment(i);
  }

  ctx.restore();
}

function drawFood(gx: number, gy: number): void {
  const cx = gx * cell + cell / 2;
  const cy = gy * cell + cell / 2;
  const r = cell * 0.34;
  ctx.fillStyle = "#ff5a52";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Shine.
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  // Leaf.
  ctx.fillStyle = "#5fbf3b";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.4, cy - r * 0.9, r * 0.42, r * 0.22, -0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawSegment(i: number): void {
  const s = snake[i];
  const pad = cell * 0.1;
  const x = s.x * cell + pad;
  const y = s.y * cell + pad;
  const sz = cell - pad * 2;
  const r = sz * 0.32;

  const isHead = i === 0;
  // Body gradient from bright head to deeper tail.
  const f = snake.length > 1 ? i / (snake.length - 1) : 0;
  const light = 56 - f * 14;
  ctx.fillStyle = isHead ? "#7ee05a" : `hsl(110, 55%, ${light}%)`;
  roundRect(x, y, sz, sz, r);
  ctx.fill();

  if (isHead) drawEyes(s);
}

function drawEyes(head: Vec): void {
  const cx = head.x * cell + cell / 2;
  const cy = head.y * cell + cell / 2;
  const off = cell * 0.18;
  const er = cell * 0.1;
  // Eyes sit toward the facing edge, perpendicular to travel.
  const fx = dir.x * cell * 0.16;
  const fy = dir.y * cell * 0.16;
  const px = -dir.y;
  const py = dir.x; // perpendicular
  const e1x = cx + fx + px * off;
  const e1y = cy + fy + py * off;
  const e2x = cx + fx - px * off;
  const e2y = cy + fy - py * off;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(e1x, e1y, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e2x, e2y, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  const pr = er * 0.55;
  ctx.beginPath();
  ctx.arc(e1x + dir.x * pr, e1y + dir.y * pr, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e2x + dir.x * pr, e2y + dir.y * pr, pr, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- Loop (time-based stepping so speed is frame-rate independent) ---
function loop(now: number): void {
  if (!lastTime) lastTime = now;
  const dt = now - lastTime;
  lastTime = now;

  if (state === STATE_PLAY) {
    acc += dt;
    // Guard against huge dt (tab switch) eating many steps at once.
    if (acc > stepMs * 4) acc = stepMs;
    while (state === STATE_PLAY && acc >= stepMs) {
      acc -= stepMs;
      step();
    }
  }
  draw();
  requestAnimationFrame(loop);
}

// --- Input ---
window.addEventListener("keydown", (e: KeyboardEvent) => {
  const k = e.key;
  if (k === "ArrowUp" || k === "w" || k === "W") {
    setDir(0, -1);
    e.preventDefault();
  } else if (k === "ArrowDown" || k === "s" || k === "S") {
    setDir(0, 1);
    e.preventDefault();
  } else if (k === "ArrowLeft" || k === "a" || k === "A") {
    setDir(-1, 0);
    e.preventDefault();
  } else if (k === "ArrowRight" || k === "d" || k === "D") {
    setDir(1, 0);
    e.preventDefault();
  } else if (k === " " || k === "Enter") {
    if (state !== STATE_PLAY) startGame();
    e.preventDefault();
  }
});

// Touch: swipe to steer, tap on overlay to (re)start.
let touchStart: Vec | null = null;
canvas.addEventListener(
  "touchstart",
  (e: TouchEvent) => {
    const tch = e.changedTouches[0];
    touchStart = { x: tch.clientX, y: tch.clientY };
    e.preventDefault();
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (e: TouchEvent) => {
    e.preventDefault();
  },
  { passive: false },
);
canvas.addEventListener(
  "touchend",
  (e: TouchEvent) => {
    if (!touchStart) return;
    const tch = e.changedTouches[0];
    const dx = tch.clientX - touchStart.x;
    const dy = tch.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      // Treated as a tap — start/continue.
      if (state !== STATE_PLAY) startGame();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
    e.preventDefault();
  },
  { passive: false },
);

// Tap the overlay to (re)start.
function onOverlayTap(e: Event): void {
  e.preventDefault();
  if (state !== STATE_PLAY) startGame();
}
overlay.addEventListener("mousedown", onOverlayTap);
overlay.addEventListener("touchstart", onOverlayTap, { passive: false });

window.addEventListener("resize", resize);
// iOS reports stale sizes during an orientation flip — re-measure after it settles.
window.addEventListener("orientationchange", () => {
  setTimeout(resize, 200);
});

// --- Boot ---
resize();
reset();
showReady();
requestAnimationFrame(loop);

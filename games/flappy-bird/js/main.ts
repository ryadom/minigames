import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "Flappy Bird",
    best: "Best",
    hint: "Tap, click or press Space to flap",
    gameover: "Game Over",
    scoreLabel: "Score",
    bestLabel: "Best",
    play: "▶ Play",
    playAgain: "▶ Play again",
  },
  ru: {
    title: "Flappy Bird",
    best: "Рекорд",
    hint: "Тап, клик или пробел — взмах",
    gameover: "Игра окончена",
    scoreLabel: "Счёт",
    bestLabel: "Рекорд",
    play: "▶ Играть",
    playAgain: "▶ Ещё раз",
  },
  es: {
    title: "Flappy Bird",
    best: "Mejor",
    hint: "Toca, clic o Espacio para aletear",
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
const overlayScore = $("overlay-score");
const overlayAction = $("overlay-action");

// Shared header: brand + language selector + a "Best" stat chip.
const ui: HeaderUI = MG.mountHeader({
  icon: "🐤",
  titleKey: "title",
  stats: [{ key: "best", labelKey: "best" }],
});

// Logical resolution — the game world is drawn at this size and the
// canvas is scaled to fit the stage.
const W = 360;
const H = 640;
let viewScale = 1;

// High-DPI sizing.
function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Keep aspect ratio of the logical world.
  const scale = Math.min(rect.width / W, rect.height / H);
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  viewScale = scale * dpr;
}

// --- Game constants ---
const GRAVITY = 0.45;
const FLAP = -7.6;
const MAX_FALL = 11;
const PIPE_W = 56;
const GAP = 160;
const PIPE_SPACING = 210;
const PIPE_SPEED = 2.2;
const GROUND_H = 90;
const BIRD_X = 90;
const BIRD_R = 15;

// --- State ---
const STATE_READY = 0;
const STATE_PLAY = 1;
const STATE_DEAD = 2;
let state: number = STATE_READY;

interface Bird {
  y: number;
  v: number;
  rot: number;
}

interface Pipe {
  x: number;
  top: number;
  passed: boolean;
}

let bird: Bird;
let pipes: Pipe[];
let score: number;
let best: number;
let frame: number;
let groundX: number;
let deadTimer: number;

// Shared versioned save store (see MG.storage in shared/mg.js).
const store = MG.storage<{ best: number }>("flappy-bird", { version: 1 });
best = (store.load() || { best: 0 }).best;
ui.setStat("best", best);

function reset(): void {
  bird = { y: H / 2, v: 0, rot: 0 };
  pipes = [];
  score = 0;
  frame = 0;
  groundX = 0;
  deadTimer = 0;
  // Seed first pipe a bit ahead.
  spawnPipe(W + 60);
  spawnPipe(W + 60 + PIPE_SPACING);
  spawnPipe(W + 60 + PIPE_SPACING * 2);
}

function spawnPipe(x: number): void {
  const margin = 60;
  const minTop = margin;
  const maxTop = H - GROUND_H - GAP - margin;
  const top = minTop + Math.random() * (maxTop - minTop);
  pipes.push({ x: x, top: top, passed: false });
}

function flap(): void {
  if (state === STATE_READY) {
    startGame();
    bird.v = FLAP;
    return;
  }
  if (state === STATE_PLAY) {
    bird.v = FLAP;
  } else if (state === STATE_DEAD && deadTimer > 30) {
    showReady();
  }
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
  if (state !== STATE_PLAY) return;
  state = STATE_DEAD;
  deadTimer = 0;
  if (score > best) {
    best = score;
    store.save({ best: best });
    ui.setStat("best", best);
  }
}

function showGameOver(): void {
  overlay.classList.remove("hidden");
  renderOverlay();
}

// Render overlay text for the current state in the current language.
// Re-runs on language change so the screen updates live.
function renderOverlay(): void {
  const t = MG.i18n.t;
  if (state === STATE_DEAD) {
    overlayTitle.textContent = `🐤 ${t("title")}`;
    overlayHint.textContent = t("gameover");
    (overlayScore as HTMLElement).hidden = false;
    overlayScore.innerHTML = `${t("scoreLabel")} <b>${score}</b><br>${t("bestLabel")} <b>${best}</b>`;
    overlayAction.textContent = t("playAgain");
  } else {
    overlayTitle.textContent = `🐤 ${t("title")}`;
    overlayHint.textContent = t("hint");
    (overlayScore as HTMLElement).hidden = true;
    overlayAction.textContent = t("play");
  }
}
MG.i18n.onChange(() => {
  if (!overlay.classList.contains("hidden")) renderOverlay();
});

// --- Update ---
function update(): void {
  frame++;
  if (state === STATE_PLAY) {
    bird.v = Math.min(bird.v + GRAVITY, MAX_FALL);
    bird.y += bird.v;

    // Move pipes.
    for (let i = 0; i < pipes.length; i++) {
      pipes[i].x -= PIPE_SPEED;
    }
    // Recycle / spawn.
    if (pipes.length && pipes[0].x + PIPE_W < 0) {
      pipes.shift();
    }
    const last = pipes[pipes.length - 1];
    if (last && last.x < W - PIPE_SPACING) {
      spawnPipe(last.x + PIPE_SPACING);
    }

    // Scoring + collisions.
    for (let j = 0; j < pipes.length; j++) {
      const p = pipes[j];
      if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
        p.passed = true;
        score++;
      }
      if (collides(p)) {
        die();
      }
    }

    // Ground / ceiling.
    if (bird.y + BIRD_R >= H - GROUND_H) {
      bird.y = H - GROUND_H - BIRD_R;
      die();
    }
    if (bird.y - BIRD_R < 0) {
      bird.y = BIRD_R;
      bird.v = 0;
    }

    // Rotation based on velocity.
    bird.rot = Math.max(-0.5, Math.min(1.4, bird.v / 12));

    groundX = (groundX - PIPE_SPEED) % 24;
  } else if (state === STATE_DEAD) {
    deadTimer++;
    // Let the bird fall to the ground.
    if (bird.y + BIRD_R < H - GROUND_H) {
      bird.v = Math.min(bird.v + GRAVITY, MAX_FALL);
      bird.y += bird.v;
      bird.rot = Math.min(1.4, bird.rot + 0.08);
    } else {
      bird.y = H - GROUND_H - BIRD_R;
    }
    if (deadTimer === 28) {
      showGameOver();
    }
  } else if (state === STATE_READY) {
    // Gentle hover.
    bird.y = H / 2 + Math.sin(frame / 18) * 8;
  }
}

function collides(p: Pipe): boolean {
  const bx = BIRD_X;
  const by = bird.y;
  const r = BIRD_R;
  // Horizontal overlap with pipe column.
  if (bx + r < p.x || bx - r > p.x + PIPE_W) return false;
  const gapTop = p.top;
  const gapBottom = p.top + GAP;
  // Collides if above the gap or below it.
  return by - r < gapTop || by + r > gapBottom;
}

// --- Render ---
function draw(): void {
  ctx.save();
  ctx.scale(viewScale, viewScale);

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#4ec0ca");
  sky.addColorStop(1, "#8fe0e6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Clouds (parallax-ish, static-ish).
  drawClouds();

  // Pipes.
  for (let i = 0; i < pipes.length; i++) {
    drawPipe(pipes[i]);
  }

  // Ground.
  drawGround();

  // Bird.
  drawBird();

  // Live score (during play / dead).
  if (state !== STATE_READY) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 4;
    ctx.font = "800 44px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.strokeText(String(score), W / 2, 28);
    ctx.fillText(String(score), W / 2, 28);
  }

  ctx.restore();
}

function drawClouds(): void {
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  const cy = 110;
  const off = (frame * 0.2) % (W + 120);
  for (let k = -1; k < 3; k++) {
    const cx = k * 160 - off + 120;
    puff(cx, cy);
    puff(cx + 80, cy + 70);
  }
}
function puff(x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.arc(x + 24, y + 6, 18, 0, Math.PI * 2);
  ctx.arc(x - 22, y + 8, 16, 0, Math.PI * 2);
  ctx.fill();
}

function drawPipe(p: Pipe): void {
  const gapTop = p.top;
  const gapBottom = p.top + GAP;
  const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
  grad.addColorStop(0, "#6fcf4a");
  grad.addColorStop(0.5, "#5bbf3b");
  grad.addColorStop(1, "#3f9e26");

  // Top pipe.
  ctx.fillStyle = grad;
  ctx.fillRect(p.x, 0, PIPE_W, gapTop);
  // Bottom pipe.
  ctx.fillRect(p.x, gapBottom, PIPE_W, H - GROUND_H - gapBottom);

  // Pipe lips (caps).
  ctx.fillStyle = "#4aa82e";
  const lipH = 18;
  const lipOver = 4;
  ctx.fillRect(p.x - lipOver, gapTop - lipH, PIPE_W + lipOver * 2, lipH);
  ctx.fillRect(p.x - lipOver, gapBottom, PIPE_W + lipOver * 2, lipH);

  // Outline / shine.
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x, 0, PIPE_W, gapTop);
  ctx.strokeRect(p.x, gapBottom, PIPE_W, H - GROUND_H - gapBottom);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(p.x + 6, 0, 6, gapTop);
  ctx.fillRect(p.x + 6, gapBottom, 6, H - GROUND_H - gapBottom);
}

function drawGround(): void {
  const gy = H - GROUND_H;
  ctx.fillStyle = "#ded895";
  ctx.fillRect(0, gy, W, GROUND_H);
  // Top grass strip.
  ctx.fillStyle = "#7ecb4f";
  ctx.fillRect(0, gy, W, 14);
  ctx.fillStyle = "#5fae37";
  ctx.fillRect(0, gy + 12, W, 4);
  // Hatching.
  ctx.fillStyle = "#cfc77f";
  for (let x = groundX; x < W; x += 24) {
    ctx.fillRect(x, gy + 22, 12, GROUND_H);
  }
}

function drawBird(): void {
  ctx.save();
  ctx.translate(BIRD_X, bird.y);
  ctx.rotate(bird.rot);

  // Body.
  ctx.fillStyle = "#ffd83d";
  ctx.strokeStyle = "#e0a900";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_R + 2, BIRD_R, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Belly.
  ctx.fillStyle = "#fff1a8";
  ctx.beginPath();
  ctx.ellipse(2, 5, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wing (flaps with frame).
  const wingUp = Math.sin(frame / (state === STATE_PLAY ? 4 : 12)) * 5;
  ctx.fillStyle = "#f6c400";
  ctx.strokeStyle = "#d99e00";
  ctx.beginPath();
  ctx.ellipse(-3, 2 + wingUp, 8, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eye.
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(9, -5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(10.5, -5, 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Beak.
  ctx.fillStyle = "#ff9b2e";
  ctx.beginPath();
  ctx.moveTo(13, -1);
  ctx.lineTo(24, 2);
  ctx.lineTo(13, 6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// --- Loop ---
function loop(): void {
  update();
  draw();
  requestAnimationFrame(loop);
}

// --- Input ---
function onTap(e: Event): void {
  e.preventDefault();
  flap();
}
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.key === " ") {
    e.preventDefault();
    flap();
  }
});
canvas.addEventListener("mousedown", onTap);
canvas.addEventListener("touchstart", onTap, { passive: false });
overlay.addEventListener("mousedown", onTap);
overlay.addEventListener("touchstart", onTap, { passive: false });

window.addEventListener("resize", resize);

// --- Boot ---
resize();
reset();
showReady();
loop();

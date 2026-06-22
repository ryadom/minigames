import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "Agar",
    mass: "Mass",
    best: "Best",
    rank: "Rank",
    hint: "Move your mouse (or drag) to glide — swallow pellets and smaller cells",
    gameover: "You were swallowed!",
    massLabel: "Mass",
    bestLabel: "Best",
    play: "▶ Play",
    playAgain: "▶ Play again",
    leaderboard: "Leaderboard",
    you: "You",
  },
  ru: {
    title: "Агарио",
    mass: "Масса",
    best: "Рекорд",
    rank: "Место",
    hint: "Веди мышью (или пальцем) — глотай шарики и клетки поменьше",
    gameover: "Вас проглотили!",
    massLabel: "Масса",
    bestLabel: "Рекорд",
    play: "▶ Играть",
    playAgain: "▶ Ещё раз",
    leaderboard: "Таблица лидеров",
    you: "Вы",
  },
  es: {
    title: "Agar",
    mass: "Masa",
    best: "Mejor",
    rank: "Puesto",
    hint: "Mueve el ratón (o arrastra) para deslizarte — traga bolitas y células menores",
    gameover: "¡Te han tragado!",
    massLabel: "Masa",
    bestLabel: "Mejor",
    play: "▶ Jugar",
    playAgain: "▶ Jugar otra vez",
    leaderboard: "Clasificación",
    you: "Tú",
  },
});

const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const overlay = $("overlay");
const overlayTitle = $("overlay-title");
const overlayHint = $("overlay-hint");
const overlayScore = $("overlay-score") as HTMLDivElement;
const overlayAction = $("overlay-action");
const board = $("board");
const boardTitle = $("board-title");
const boardList = $("board-list") as HTMLOListElement;

// Shared header: brand + language selector + Mass / Rank / Best stat chips.
const ui: HeaderUI = MG.mountHeader({
  icon: "🦠",
  titleKey: "title",
  stats: [
    { key: "mass", labelKey: "mass", value: 0 },
    { key: "rank", labelKey: "rank", variant: "sm" },
    { key: "best", labelKey: "best" },
  ],
});

/* ============================ world ============================ */
const WORLD = 2600; // square world side length, in world units
const FOOD_COUNT = 420; // pellets kept alive at all times
const BOT_COUNT = 14; // AI cells alive at all times
const START_MASS = 16;
const MIN_MASS = 12;
const FOOD_MASS = 1;

// A cell (player or bot) is a circle whose radius grows with the sqrt of mass,
// so area scales linearly with mass — eating doubles area, not radius.
function radiusOf(mass: number): number {
  return Math.sqrt(mass) * 4.2;
}

// Bigger cells crawl; smaller ones dart. Speed eases off as mass climbs.
function speedOf(mass: number): number {
  return 215 / (radiusOf(mass) * 0.16 + 4);
}

interface Food {
  x: number;
  y: number;
  c: string;
  r: number;
}

interface Cell {
  x: number;
  y: number;
  mass: number;
  c: string;
  name: string;
  // velocity used for smooth glide (bots steer, player follows pointer)
  vx: number;
  vy: number;
  bot: boolean;
  dead: boolean;
}

const FOOD_COLORS = ["#ff5a52", "#ffd23f", "#7ee05a", "#5ad0e0", "#b07bff", "#ff8c42", "#ff6fb5"];
const BOT_NAMES = [
  "Blob",
  "Nibbler",
  "Goo",
  "Splat",
  "Orbz",
  "Muncher",
  "Pip",
  "Zoom",
  "Chomp",
  "Wisp",
  "Slurp",
  "Bubble",
  "Dot",
  "Gulp",
  "Squish",
  "Pog",
];

let food: Food[] = [];
let cells: Cell[] = [];
let player: Cell;

// Pointer target in screen space (relative to canvas centre). The player glides
// toward it; magnitude controls how hard we steer (clamped near the centre).
let pointerX = 0;
let pointerY = 0;
let pointerActive = false;

let camX = 0;
let camY = 0;
let camScale = 1;

let best = 0;
let lastTime = 0;
let viewW = 0;
let viewH = 0;
let dpr = 1;

/* ============================ state ============================ */
const STATE_READY = 0;
const STATE_PLAY = 1;
const STATE_DEAD = 2;
let state = STATE_READY;

// Shared versioned save store (best mass reached).
const store = MG.storage<{ best: number }>("agar-io", { version: 1 });
best = (store.load() || { best: 0 }).best;
ui.setStat("best", Math.floor(best));

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randColor(): string {
  return `hsl(${(Math.random() * 360) | 0}, 70%, 58%)`;
}

function spawnFood(): Food {
  const c = FOOD_COLORS[(Math.random() * FOOD_COLORS.length) | 0];
  return { x: rand(0, WORLD), y: rand(0, WORLD), c, r: rand(5, 7) };
}

function spawnBot(): Cell {
  return {
    x: rand(0, WORLD),
    y: rand(0, WORLD),
    mass: rand(MIN_MASS, START_MASS * 2.6),
    c: randColor(),
    name: BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0],
    vx: 0,
    vy: 0,
    bot: true,
    dead: false,
  };
}

function reset(): void {
  food = [];
  for (let i = 0; i < FOOD_COUNT; i++) food.push(spawnFood());

  player = {
    x: WORLD / 2,
    y: WORLD / 2,
    mass: START_MASS,
    c: "#5ad0e0",
    name: MG.i18n.t("you"),
    vx: 0,
    vy: 0,
    bot: false,
    dead: false,
  };

  cells = [player];
  for (let i = 0; i < BOT_COUNT; i++) cells.push(spawnBot());

  pointerActive = false;
  camX = player.x;
  camY = player.y;
  ui.setStat("mass", Math.floor(player.mass));
  ui.setStat("rank", "—");
}

/* ============================ input ============================ */
function setPointerFromEvent(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  pointerX = clientX - rect.left - rect.width / 2;
  pointerY = clientY - rect.top - rect.height / 2;
  pointerActive = true;
}

canvas.addEventListener("mousemove", (e: MouseEvent) => {
  setPointerFromEvent(e.clientX, e.clientY);
});
canvas.addEventListener("mouseleave", () => {
  pointerActive = false;
});

canvas.addEventListener(
  "touchstart",
  (e: TouchEvent) => {
    const t = e.changedTouches[0];
    setPointerFromEvent(t.clientX, t.clientY);
    if (state !== STATE_PLAY) startGame();
    e.preventDefault();
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (e: TouchEvent) => {
    const t = e.changedTouches[0];
    setPointerFromEvent(t.clientX, t.clientY);
    e.preventDefault();
  },
  { passive: false },
);
canvas.addEventListener(
  "touchend",
  (e: TouchEvent) => {
    pointerActive = false;
    e.preventDefault();
  },
  { passive: false },
);

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === " " || e.key === "Enter") {
    if (state !== STATE_PLAY) startGame();
    e.preventDefault();
  }
});

function onOverlayTap(e: Event): void {
  e.preventDefault();
  if (state !== STATE_PLAY) startGame();
}
overlay.addEventListener("mousedown", onOverlayTap);
overlay.addEventListener("touchstart", onOverlayTap, { passive: false });

/* ============================ flow ============================ */
function startGame(): void {
  reset();
  state = STATE_PLAY;
  overlay.classList.add("hidden");
  board.hidden = false;
}

function showReady(): void {
  reset();
  state = STATE_READY;
  overlay.classList.remove("hidden");
  board.hidden = true;
  renderOverlay();
}

function die(): void {
  state = STATE_DEAD;
  const reached = Math.floor(player.mass);
  if (reached > best) {
    best = reached;
    store.save({ best });
    ui.setStat("best", best);
  }
  board.hidden = true;
  overlay.classList.remove("hidden");
  renderOverlay();
}

function renderOverlay(): void {
  const t = MG.i18n.t;
  overlayTitle.textContent = `🦠 ${t("title")}`;
  if (state === STATE_DEAD) {
    overlayHint.textContent = t("gameover");
    overlayScore.hidden = false;
    overlayScore.innerHTML = `${t("massLabel")} <b>${Math.floor(player.mass)}</b><br>${t("bestLabel")} <b>${Math.floor(best)}</b>`;
    overlayAction.textContent = t("playAgain");
  } else {
    overlayHint.textContent = t("hint");
    overlayScore.hidden = true;
    overlayAction.textContent = t("play");
  }
  boardTitle.textContent = t("leaderboard");
}
MG.i18n.onChange(() => {
  if (!overlay.classList.contains("hidden")) renderOverlay();
  boardTitle.textContent = MG.i18n.t("leaderboard");
  if (state !== STATE_PLAY && player) player.name = MG.i18n.t("you");
});

function flashStat(key: string): void {
  const e = ui.stat(key);
  if (!e) return;
  e.classList.remove("mg-flash");
  void e.offsetWidth;
  e.classList.add("mg-flash");
}

/* ============================ simulation ============================ */
// Move a cell toward (tx, ty) in world space at its mass-derived speed.
function steer(cell: Cell, tx: number, ty: number, dt: number): void {
  const dx = tx - cell.x;
  const dy = ty - cell.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = speedOf(cell.mass);
  // Ease velocity toward the desired direction for a smooth glide.
  const desiredVx = (dx / dist) * speed;
  const desiredVy = (dy / dist) * speed;
  cell.vx += (desiredVx - cell.vx) * Math.min(1, dt * 6);
  cell.vy += (desiredVy - cell.vy) * Math.min(1, dt * 6);
  cell.x += cell.vx * dt;
  cell.y += cell.vy * dt;
  // Keep cells inside the world bounds.
  const r = radiusOf(cell.mass);
  cell.x = Math.max(r, Math.min(WORLD - r, cell.x));
  cell.y = Math.max(r, Math.min(WORLD - r, cell.y));
}

// Simple bot brain: chase the best nearby prey, flee nearby predators, else
// drift toward the closest pellet (or wander).
function botThink(bot: Cell): { tx: number; ty: number } {
  const sight = 360 + radiusOf(bot.mass) * 4;
  let fleeX = 0;
  let fleeY = 0;
  let threat = false;
  let preyX = 0;
  let preyY = 0;
  let preyD = Infinity;

  for (const o of cells) {
    if (o === bot || o.dead) continue;
    const dx = o.x - bot.x;
    const dy = o.y - bot.y;
    const d = Math.hypot(dx, dy);
    if (d > sight) continue;
    if (o.mass > bot.mass * 1.12) {
      // Predator — steer away, weighted by closeness.
      const w = 1 - d / sight;
      fleeX -= (dx / (d || 1)) * w;
      fleeY -= (dy / (d || 1)) * w;
      threat = true;
    } else if (bot.mass > o.mass * 1.18 && d < preyD) {
      preyX = o.x;
      preyY = o.y;
      preyD = d;
    }
  }

  if (threat) {
    return { tx: bot.x + fleeX * 200, ty: bot.y + fleeY * 200 };
  }
  if (preyD < Infinity) {
    return { tx: preyX, ty: preyY };
  }

  // Hunt the nearest pellet within a generous range.
  let fx = bot.x;
  let fy = bot.y;
  let fd = Infinity;
  for (const f of food) {
    const d = Math.hypot(f.x - bot.x, f.y - bot.y);
    if (d < fd) {
      fd = d;
      fx = f.x;
      fy = f.y;
    }
  }
  if (fd < 520) return { tx: fx, ty: fy };

  // Wander: nudge toward a slowly drifting heading kept on the velocity.
  return { tx: bot.x + bot.vx + rand(-60, 60), ty: bot.y + bot.vy + rand(-60, 60) };
}

function eatFood(cell: Cell): void {
  const r = radiusOf(cell.mass);
  for (let i = 0; i < food.length; i++) {
    const f = food[i];
    const dx = f.x - cell.x;
    const dy = f.y - cell.y;
    if (dx * dx + dy * dy < r * r) {
      cell.mass += FOOD_MASS;
      if (cell === player) {
        ui.setStat("mass", Math.floor(player.mass));
        flashStat("mass");
      }
      // Recycle the pellet elsewhere.
      food[i] = spawnFood();
    }
  }
}

// A cell swallows another when it is meaningfully bigger and its centre has
// engulfed enough of the smaller one.
function resolveEats(): void {
  for (const a of cells) {
    if (a.dead) continue;
    const ra = radiusOf(a.mass);
    for (const b of cells) {
      if (a === b || b.dead) continue;
      if (a.mass <= b.mass * 1.18) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < ra - radiusOf(b.mass) * 0.45) {
        a.mass += b.mass * 0.9;
        b.dead = true;
        if (a === player) {
          ui.setStat("mass", Math.floor(player.mass));
          flashStat("mass");
        }
      }
    }
  }
}

function update(dt: number): void {
  // Player follows the pointer; with no pointer it coasts to a stop.
  if (pointerActive) {
    // Convert the screen-space pointer offset into a world target ahead of the
    // player, scaled so small wrist movements still steer fully.
    const reach = 600;
    const len = Math.hypot(pointerX, pointerY) || 1;
    const k = Math.min(1, len / 90); // dead-zone near centre
    const tx = player.x + (pointerX / len) * reach * k;
    const ty = player.y + (pointerY / len) * reach * k;
    steer(player, tx, ty, dt);
  } else {
    player.vx *= 0.9;
    player.vy *= 0.9;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
  }

  for (const c of cells) {
    if (c.dead || !c.bot) continue;
    const { tx, ty } = botThink(c);
    steer(c, tx, ty, dt);
  }

  for (const c of cells) {
    if (!c.dead) eatFood(c);
  }
  resolveEats();

  // Player slowly leaks mass so it can't snowball forever.
  if (player.mass > START_MASS) {
    player.mass = Math.max(START_MASS, player.mass - player.mass * 0.0008 * dt * 60);
    ui.setStat("mass", Math.floor(player.mass));
  }

  if (player.dead) {
    die();
    return;
  }

  // Keep the bot population topped up.
  let alive = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (c.dead) {
      cells.splice(i, 1);
    } else if (c.bot) {
      alive++;
    }
  }
  while (alive < BOT_COUNT) {
    cells.push(spawnBot());
    alive++;
  }

  // Camera eases toward the player and zooms out as it grows.
  const targetScale = Math.min(1.1, 42 / radiusOf(player.mass));
  camScale += (targetScale - camScale) * Math.min(1, dt * 3);
  camX += (player.x - camX) * Math.min(1, dt * 6);
  camY += (player.y - camY) * Math.min(1, dt * 6);

  updateLeaderboard();
}

function updateLeaderboard(): void {
  const ranked = cells.filter((c) => !c.dead).sort((a, b) => b.mass - a.mass);
  const myRank = ranked.indexOf(player) + 1;
  ui.setStat("rank", `${myRank}/${ranked.length}`);

  const top = ranked.slice(0, 5);
  // Always show the player's row even when off the top five.
  const rows = top.includes(player) ? top : top.slice(0, 4).concat(player);
  boardList.innerHTML = "";
  for (const c of rows) {
    const place = ranked.indexOf(c) + 1;
    const li = document.createElement("li");
    if (c === player) li.className = "me";
    li.innerHTML =
      `<span class="nm"><span class="rank">${place}.</span>${c.name}</span>` +
      `<span class="ms">${Math.floor(c.mass)}</span>`;
    boardList.appendChild(li);
  }
}

/* ============================ render ============================ */
function resize(): void {
  const area = canvas.parentNode?.parentNode as HTMLElement; // .mg-game-area
  viewW = area.clientWidth;
  viewH = area.clientHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
}

function worldToScreenSetup(): void {
  // Centre on the camera, apply zoom, all in device pixels.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(viewW / 2, viewH / 2);
  ctx.scale(camScale, camScale);
  ctx.translate(-camX, -camY);
}

function drawGrid(): void {
  const step = 50;
  // Visible world rectangle.
  const halfW = viewW / 2 / camScale;
  const halfH = viewH / 2 / camScale;
  const x0 = Math.max(0, camX - halfW);
  const y0 = Math.max(0, camY - halfH);
  const x1 = Math.min(WORLD, camX + halfW);
  const y1 = Math.min(WORLD, camY + halfH);

  ctx.lineWidth = 1 / camScale;
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();

  // World border.
  ctx.strokeStyle = "rgba(120,180,255,0.25)";
  ctx.lineWidth = 4 / camScale;
  ctx.strokeRect(0, 0, WORLD, WORLD);
}

function drawCell(c: Cell): void {
  const r = radiusOf(c.mass);
  ctx.fillStyle = c.c;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Darker rim for depth.
  ctx.lineWidth = Math.max(2, r * 0.08) / 1;
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.stroke();

  // Name label (scaled so it stays readable as we zoom).
  if (r * camScale > 14) {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `700 ${Math.max(11, r * 0.42)}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.name, c.x, c.y);
  }
}

function draw(): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);

  worldToScreenSetup();
  drawGrid();

  for (const f of food) {
    ctx.fillStyle = f.c;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw cells smallest-first so bigger blobs render on top.
  const ordered = cells.filter((c) => !c.dead).sort((a, b) => a.mass - b.mass);
  for (const c of ordered) drawCell(c);
}

function loop(now: number): void {
  if (!lastTime) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05; // clamp after tab switches

  if (state === STATE_PLAY) update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ============================ boot ============================ */
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));

resize();
reset();
showReady();
requestAnimationFrame(loop);

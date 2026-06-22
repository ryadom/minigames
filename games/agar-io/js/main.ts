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
    split: "Split",
    hint2: "Press Space (or tap Split / double-tap) to split and dash",
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
    split: "Делиться",
    hint2: "Пробел (или кнопка «Делиться» / двойной тап) — разделиться и рвануть",
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
    split: "Dividir",
    hint2: "Pulsa Espacio (o el botón Dividir / doble toque) para dividirte y lanzarte",
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
const minimap = $("minimap") as HTMLCanvasElement;
const mctx = minimap.getContext("2d") as CanvasRenderingContext2D;
const splitBtn = $("split-btn") as HTMLButtonElement;

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

// Mass slowly leaks so cells can't snowball forever — but gently (~0.15%/s),
// so eating pellets comfortably outpaces decay and the player can actually grow.
const DECAY_RATE = 0.0015;

// Splitting: a cell halves and flings a copy toward the aim direction. Halves
// can't eat each other; they drift back together and re-merge after a cooldown.
const SPLIT_MIN_MASS = 35; // need at least this much to split
const MAX_PLAYER_CELLS = 16;
const SPLIT_BOOST = 560; // initial launch speed of the flung half (world u/s)
const MERGE_COOLDOWN = 9000; // ms before two own cells may merge back

// A cell (player or bot) is a circle whose radius grows with the sqrt of mass,
// so area scales linearly with mass — eating doubles area, not radius.
function radiusOf(mass: number): number {
  return Math.sqrt(mass) * 4.2;
}

// Bigger cells crawl; smaller ones dart. Speed eases off as mass climbs.
function speedOf(mass: number): number {
  return 290 / (radiusOf(mass) * 0.16 + 4);
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
  // extra momentum imparted by a split dash; decays back to zero quickly
  boostVx: number;
  boostVy: number;
  // timestamp (ms) before which this own cell refuses to merge with siblings
  mergeAt: number;
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
// The player owns one or more cells (one normally, several after splitting).
// Every non-bot cell in `cells` is player-owned; these helpers aggregate them.
let playerName = "You";
const playerColor = "#5ad0e0";
let playerMass = START_MASS; // last known total mass (kept for the death screen)

function playerCells(): Cell[] {
  return cells.filter((c) => !c.bot && !c.dead);
}
function totalPlayerMass(): number {
  let m = 0;
  for (const c of playerCells()) m += c.mass;
  return m;
}
// Mass-weighted centre of the player's cells (camera + steering origin).
function playerCentroid(): { x: number; y: number } {
  let mx = 0;
  let my = 0;
  let tm = 0;
  for (const c of playerCells()) {
    mx += c.x * c.mass;
    my += c.y * c.mass;
    tm += c.mass;
  }
  if (tm === 0) return { x: camX, y: camY };
  return { x: mx / tm, y: my / tm };
}

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
    boostVx: 0,
    boostVy: 0,
    mergeAt: 0,
    bot: true,
    dead: false,
  };
}

function reset(): void {
  food = [];
  for (let i = 0; i < FOOD_COUNT; i++) food.push(spawnFood());

  playerName = MG.i18n.t("you");
  playerMass = START_MASS;
  const me: Cell = {
    x: WORLD / 2,
    y: WORLD / 2,
    mass: START_MASS,
    c: playerColor,
    name: playerName,
    vx: 0,
    vy: 0,
    boostVx: 0,
    boostVy: 0,
    mergeAt: 0,
    bot: false,
    dead: false,
  };

  cells = [me];
  for (let i = 0; i < BOT_COUNT; i++) cells.push(spawnBot());

  pointerActive = false;
  camX = me.x;
  camY = me.y;
  camScale = 1;
  ui.setStat("mass", Math.floor(START_MASS));
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

let lastTapTime = 0;
canvas.addEventListener(
  "touchstart",
  (e: TouchEvent) => {
    const t = e.changedTouches[0];
    setPointerFromEvent(t.clientX, t.clientY);
    if (state !== STATE_PLAY) {
      startGame();
    } else {
      // Double-tap the playfield to split toward where you tapped.
      const now = performance.now();
      if (now - lastTapTime < 300) splitPlayer();
      lastTapTime = now;
    }
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
    else if (e.key === " ") splitPlayer();
    e.preventDefault();
  }
});

function onOverlayTap(e: Event): void {
  e.preventDefault();
  if (state !== STATE_PLAY) startGame();
}
overlay.addEventListener("mousedown", onOverlayTap);
overlay.addEventListener("touchstart", onOverlayTap, { passive: false });

// Split button (works for both mouse and touch). preventDefault on touchstart
// stops the synthetic click so we don't split twice.
splitBtn.addEventListener("click", (e) => {
  e.preventDefault();
  splitPlayer();
});
splitBtn.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    splitPlayer();
  },
  { passive: false },
);

/* ============================ flow ============================ */
// Show/hide the in-play HUD (leaderboard, minimap, split button) together.
function showHud(visible: boolean): void {
  board.hidden = !visible;
  minimap.hidden = !visible;
  splitBtn.hidden = !visible;
}

function startGame(): void {
  reset();
  state = STATE_PLAY;
  overlay.classList.add("hidden");
  showHud(true);
}

function showReady(): void {
  reset();
  state = STATE_READY;
  overlay.classList.remove("hidden");
  showHud(false);
  renderOverlay();
}

function die(): void {
  state = STATE_DEAD;
  const reached = Math.floor(playerMass);
  if (reached > best) {
    best = reached;
    store.save({ best });
    ui.setStat("best", best);
  }
  showHud(false);
  overlay.classList.remove("hidden");
  renderOverlay();
}

function renderOverlay(): void {
  const t = MG.i18n.t;
  overlayTitle.textContent = `🦠 ${t("title")}`;
  if (state === STATE_DEAD) {
    overlayHint.textContent = t("gameover");
    overlayScore.hidden = false;
    overlayScore.innerHTML = `${t("massLabel")} <b>${Math.floor(playerMass)}</b><br>${t("bestLabel")} <b>${Math.floor(best)}</b>`;
    overlayAction.textContent = t("playAgain");
  } else {
    overlayHint.innerHTML = `${t("hint")}<br>${t("hint2")}`;
    overlayScore.hidden = true;
    overlayAction.textContent = t("play");
  }
  boardTitle.textContent = t("leaderboard");
  splitBtn.textContent = t("split");
}
MG.i18n.onChange(() => {
  if (!overlay.classList.contains("hidden")) renderOverlay();
  boardTitle.textContent = MG.i18n.t("leaderboard");
  splitBtn.textContent = MG.i18n.t("split");
  playerName = MG.i18n.t("you");
  if (state !== STATE_PLAY) for (const c of playerCells()) c.name = playerName;
});

function flashStat(key: string): void {
  const e = ui.stat(key);
  if (!e) return;
  e.classList.remove("mg-flash");
  void e.offsetWidth;
  e.classList.add("mg-flash");
}

/* ============================ splitting ============================ */
// Unit aim vector for a cell: toward the pointer if active, else along the
// cell's heading, else a random direction.
function aimDir(cell: Cell): { x: number; y: number } {
  if (pointerActive) {
    const len = Math.hypot(pointerX, pointerY);
    if (len > 1) return { x: pointerX / len, y: pointerY / len };
  }
  const vl = Math.hypot(cell.vx, cell.vy);
  if (vl > 1) return { x: cell.vx / vl, y: cell.vy / vl };
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
}

// Halve each eligible player cell and fling a copy toward the aim direction.
function splitPlayer(): void {
  if (state !== STATE_PLAY) return;
  const now = performance.now();
  const owned = playerCells();
  let count = owned.length;
  const fresh: Cell[] = [];
  for (const c of owned) {
    if (count >= MAX_PLAYER_CELLS) break;
    if (c.mass < SPLIT_MIN_MASS) continue;
    const half = c.mass / 2;
    c.mass = half;
    c.mergeAt = now + MERGE_COOLDOWN;
    const d = aimDir(c);
    fresh.push({
      x: c.x + d.x * radiusOf(half),
      y: c.y + d.y * radiusOf(half),
      mass: half,
      c: c.c,
      name: c.name,
      vx: c.vx,
      vy: c.vy,
      boostVx: d.x * SPLIT_BOOST,
      boostVy: d.y * SPLIT_BOOST,
      mergeAt: now + MERGE_COOLDOWN,
      bot: false,
      dead: false,
    });
    count++;
  }
  cells.push(...fresh);
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
      if (!cell.bot) flashStat("mass");
      // Recycle the pellet elsewhere.
      food[i] = spawnFood();
    }
  }
}

// Resolve cell-vs-cell interactions. Cells with different owners eat each other
// (bigger swallows smaller); two cells the player owns instead bounce apart
// until their merge cooldown elapses, then re-merge.
function resolveEats(): void {
  const now = performance.now();
  for (const a of cells) {
    if (a.dead) continue;
    const ra = radiusOf(a.mass);
    for (const b of cells) {
      if (a === b || b.dead) continue;
      const rb = radiusOf(b.mass);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;

      if (!a.bot && !b.bot) {
        // Both player-owned: merge when allowed, otherwise push apart.
        if (now >= a.mergeAt && now >= b.mergeAt) {
          if (a.mass >= b.mass && d < ra - rb * 0.2) {
            a.mass += b.mass;
            b.dead = true;
            flashStat("mass");
          }
        } else {
          const overlap = ra + rb - d;
          if (overlap > 0) {
            const push = overlap / 2;
            const ux = dx / d;
            const uy = dy / d;
            a.x -= ux * push;
            a.y -= uy * push;
            b.x += ux * push;
            b.y += uy * push;
          }
        }
        continue;
      }

      // Different owners: a swallows b when meaningfully bigger and overlapping.
      if (a.mass <= b.mass * 1.18) continue;
      if (d < ra - rb * 0.45) {
        a.mass += b.mass * 0.9;
        b.dead = true;
        if (!a.bot) flashStat("mass");
      }
    }
  }
}

function update(dt: number): void {
  const owned = playerCells();
  const cen = playerCentroid();

  // World-space target for the player's cells, derived from the pointer offset.
  let tx = cen.x;
  let ty = cen.y;
  if (pointerActive) {
    const reach = 600;
    const len = Math.hypot(pointerX, pointerY) || 1;
    const k = Math.min(1, len / 90); // dead-zone near centre
    tx = cen.x + (pointerX / len) * reach * k;
    ty = cen.y + (pointerY / len) * reach * k;
  }

  for (const c of owned) {
    if (pointerActive) {
      steer(c, tx, ty, dt);
    } else {
      c.vx *= 0.9;
      c.vy *= 0.9;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    // Apply (and decay) the dash imparted by a split.
    if (c.boostVx !== 0 || c.boostVy !== 0) {
      c.x += c.boostVx * dt;
      c.y += c.boostVy * dt;
      const k = Math.exp(-dt * 6);
      c.boostVx *= k;
      c.boostVy *= k;
      if (Math.abs(c.boostVx) < 2) c.boostVx = 0;
      if (Math.abs(c.boostVy) < 2) c.boostVy = 0;
    }
  }

  for (const c of cells) {
    if (c.dead || !c.bot) continue;
    const aim = botThink(c);
    steer(c, aim.tx, aim.ty, dt);
  }

  for (const c of cells) {
    if (!c.dead) eatFood(c);
  }
  resolveEats();

  // Player cells slowly leak mass — gently, so eating outpaces it.
  for (const c of playerCells()) {
    if (c.mass > MIN_MASS) c.mass = Math.max(MIN_MASS, c.mass - c.mass * DECAY_RATE * dt);
  }

  // Keep every cell inside the world after eats/pushes.
  for (const c of cells) {
    if (c.dead) continue;
    const r = radiusOf(c.mass);
    c.x = Math.max(r, Math.min(WORLD - r, c.x));
    c.y = Math.max(r, Math.min(WORLD - r, c.y));
  }

  if (playerCells().length === 0) {
    die();
    return;
  }

  const total = totalPlayerMass();
  playerMass = total;
  ui.setStat("mass", Math.floor(total));

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

  // Camera eases toward the player's centroid and zooms to keep its cells (even
  // when split far apart) in view, clamped so it never gets uselessly tiny.
  const cen2 = playerCentroid();
  let extent = radiusOf(total);
  for (const c of playerCells()) {
    extent = Math.max(extent, Math.hypot(c.x - cen2.x, c.y - cen2.y) + radiusOf(c.mass));
  }
  const targetScale = Math.max(0.28, Math.min(1.1, 42 / extent));
  camScale += (targetScale - camScale) * Math.min(1, dt * 3);
  camX += (cen2.x - camX) * Math.min(1, dt * 6);
  camY += (cen2.y - camY) * Math.min(1, dt * 6);

  updateLeaderboard();
}

function updateLeaderboard(): void {
  // The player is ranked as a single entity (its combined mass) against bots.
  const total = totalPlayerMass();
  interface Row {
    name: string;
    mass: number;
    me: boolean;
  }
  const rows: Row[] = cells
    .filter((c) => c.bot && !c.dead)
    .map((c) => ({ name: c.name, mass: c.mass, me: false }));
  rows.push({ name: playerName, mass: total, me: true });
  rows.sort((a, b) => b.mass - a.mass);

  const myRank = rows.findIndex((r) => r.me) + 1;
  ui.setStat("rank", `${myRank}/${rows.length}`);

  const top = rows.slice(0, 5);
  // Always show the player's row even when off the top five.
  if (!top.some((r) => r.me)) {
    const mine = rows.find((r) => r.me);
    if (mine) top[4] = mine;
  }
  boardList.innerHTML = "";
  for (const r of top) {
    const place = rows.indexOf(r) + 1;
    const li = document.createElement("li");
    if (r.me) li.className = "me";
    li.innerHTML =
      `<span class="nm"><span class="rank">${place}.</span>${r.name}</span>` +
      `<span class="ms">${Math.floor(r.mass)}</span>`;
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

// Top-down overview: bots as faint dots, the player's cells highlighted, plus
// a rectangle showing the slice of the world currently on screen.
function drawMinimap(): void {
  if (minimap.hidden) return;
  const size = minimap.clientWidth;
  if (size === 0) return;
  const px = Math.round(size * dpr);
  if (minimap.width !== px) {
    minimap.width = px;
    minimap.height = px;
  }
  const s = size / WORLD;
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, size, size);

  // Bots first, then the player on top.
  for (const c of cells) {
    if (c.dead) continue;
    if (c.bot) {
      mctx.fillStyle = "rgba(255,255,255,0.45)";
      const r = Math.max(1.4, radiusOf(c.mass) * s);
      mctx.beginPath();
      mctx.arc(c.x * s, c.y * s, r, 0, Math.PI * 2);
      mctx.fill();
    }
  }
  for (const c of playerCells()) {
    mctx.fillStyle = "#7ee0ff";
    const r = Math.max(2.4, radiusOf(c.mass) * s);
    mctx.beginPath();
    mctx.arc(c.x * s, c.y * s, r, 0, Math.PI * 2);
    mctx.fill();
  }

  // Viewport rectangle.
  const halfW = viewW / 2 / camScale;
  const halfH = viewH / 2 / camScale;
  mctx.strokeStyle = "rgba(126,224,255,0.6)";
  mctx.lineWidth = 1;
  mctx.strokeRect((camX - halfW) * s, (camY - halfH) * s, halfW * 2 * s, halfH * 2 * s);
}

function loop(now: number): void {
  if (!lastTime) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05; // clamp after tab switches

  if (state === STATE_PLAY) update(dt);
  draw();
  drawMinimap();
  requestAnimationFrame(loop);
}

/* ============================ boot ============================ */
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));

resize();
reset();
showReady();
requestAnimationFrame(loop);

import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";

/* ==========================================================================
   Slither — a small slither.io clone.

   You glide around a big circular arena, eat glowing orbs to grow longer, and
   try to cut off rival snakes: a snake dies when its *head* runs into another
   snake's body, spilling its mass as fresh orbs. Last one slithering wins the
   high score. The world is far larger than the screen, so the camera follows
   your head and a minimap shows the wider arena.
   ========================================================================== */

interface Vec {
  x: number;
  y: number;
}

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "Slither",
    length: "Length",
    best: "Best",
    rank: "Rank",
    hint: "Steer with the mouse, touch or arrow keys.<br>Hold to boost — eat orbs to grow, ram others to pop them.",
    gameover: "You got swallowed!",
    lengthLabel: "Length",
    bestLabel: "Best",
    rankLabel: "Rank",
    play: "▶ Play",
    playAgain: "▶ Play again",
  },
  ru: {
    title: "Червяк",
    length: "Длина",
    best: "Рекорд",
    rank: "Место",
    hint: "Управляй мышью, касанием или стрелками.<br>Удерживай для ускорения — ешь шарики и тарань других.",
    gameover: "Тебя проглотили!",
    lengthLabel: "Длина",
    bestLabel: "Рекорд",
    rankLabel: "Место",
    play: "▶ Играть",
    playAgain: "▶ Ещё раз",
  },
  es: {
    title: "Gusano",
    length: "Largo",
    best: "Mejor",
    rank: "Puesto",
    hint: "Muévete con el ratón, el dedo o las flechas.<br>Mantén para acelerar — come orbes y choca a los demás.",
    gameover: "¡Te tragaron!",
    lengthLabel: "Largo",
    bestLabel: "Mejor",
    rankLabel: "Puesto",
    play: "▶ Jugar",
    playAgain: "▶ Jugar otra vez",
  },
});

const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const minimap = $("minimap") as HTMLCanvasElement;
const mctx = minimap.getContext("2d") as CanvasRenderingContext2D;
const boostBtn = $("boost") as HTMLButtonElement;
const overlay = $("overlay");
const overlayTitle = $("overlay-title");
const overlayHint = $("overlay-hint");
const overlayScore = $("overlay-score") as HTMLDivElement;
const overlayAction = $("overlay-action");

// Shared header: brand + language selector + Length / Rank / Best stat chips.
const ui: HeaderUI = MG.mountHeader({
  icon: "🪱",
  titleKey: "title",
  stats: [
    { key: "length", labelKey: "length", value: 0 },
    { key: "rank", labelKey: "rank", variant: "sm", value: "—" },
    { key: "best", labelKey: "best" },
  ],
});

/* ============================ World constants ============================ */
const WORLD_R = 2000; // arena radius (world units)
const FOOD_TARGET = 650; // how many free orbs to keep scattered around
const BOT_COUNT = 14; // rival snakes kept alive at once

const BASE_LEN = 14; // starting body length (segments)
const BASE_R = 9; // head/body radius at the starting length
const SPEED = 168; // cruise speed (world units / second)
const BOOST_SPEED = 290; // speed while boosting
const TURN_RATE = 5.0; // max steering (radians / second)

// Boost burns length and trails orbs behind you.
const BOOST_MIN_LEN = BASE_LEN + 6; // can't boost below this
const BOOST_DRAIN = 9; // length lost per second of boosting

const HUES = [140, 200, 280, 330, 30, 50, 175, 250, 0, 95];

/* ============================ Snake model ============================ */
interface Snake {
  isBot: boolean;
  dead: boolean;
  hue: number;
  x: number;
  y: number;
  angle: number; // current heading (radians)
  target: number; // desired heading
  len: number; // body length (float; floor = visible segments)
  speed: number;
  boosting: boolean;
  path: Vec[]; // head history, newest first (index 0 = head)
  body: Vec[]; // resolved segment centres this frame (head .. tail)
  radius: number;
  // bot brain
  aiTimer: number;
  aiTurn: number;
}

interface Food {
  x: number;
  y: number;
  r: number;
  hue: number;
  val: number; // length gained when eaten
}

let snakes: Snake[] = [];
let foods: Food[] = [];
let player: Snake;

/* ============================ State ============================ */
const STATE_READY = 0;
const STATE_PLAY = 1;
const STATE_DEAD = 2;
let state = STATE_READY;

let best: number;
let lastTime = 0;

const store = MG.storage<{ best: number }>("slither", { version: 1 });
best = (store.load() || { best: 0 }).best;
ui.setStat("best", best);

/* ============================ Geometry helpers ============================ */
function radiusFor(len: number): number {
  return BASE_R + Math.min(20, (len - BASE_LEN) * 0.05);
}

function segGap(r: number): number {
  return r * 0.55;
}

function angleLerp(from: number, to: number, maxStep: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep;
  else if (d < -maxStep) d = -maxStep;
  return from + d;
}

// Walk a snake's head-history path and sample segment centres at fixed gaps.
function resolveBody(s: Snake): void {
  const n = Math.max(2, Math.floor(s.len));
  const gap = segGap(s.radius);
  const out: Vec[] = s.body;
  out.length = 0;
  const path = s.path;
  if (path.length === 0) return;

  out.push({ x: path[0].x, y: path[0].y }); // head
  let target = gap;
  let seg = 1;
  let acc = 0;
  let prev = path[0];
  for (let i = 1; i < path.length && seg < n; i++) {
    const cur = path[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const segLen = Math.hypot(dx, dy);
    while (seg < n && acc + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - acc) / segLen;
      out.push({ x: prev.x + dx * t, y: prev.y + dy * t });
      seg++;
      target += gap;
    }
    acc += segLen;
    prev = cur;
  }
  // If the path is too short (just spawned), pad with the tail point.
  while (seg < n) {
    out.push({ x: prev.x, y: prev.y });
    seg++;
  }
}

// Drop the path history we no longer need to draw the tail.
function trimPath(s: Snake): void {
  const need = Math.floor(s.len) * segGap(s.radius) + 60;
  const path = s.path;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    acc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (acc > need) {
      path.length = i + 1;
      return;
    }
  }
}

/* ============================ Spawning ============================ */
function randInDisc(radius: number): Vec {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

function spawnFood(x: number, y: number, hue: number, val: number): void {
  foods.push({ x, y, hue, val, r: 4 + val * 1.6 });
}

function fillFood(): void {
  while (foods.length < FOOD_TARGET) {
    const p = randInDisc(WORLD_R * 0.97);
    spawnFood(p.x, p.y, (Math.random() * 360) | 0, 1);
  }
}

function makeSnake(isBot: boolean, hue: number): Snake {
  const p = randInDisc(WORLD_R * 0.8);
  const angle = Math.random() * Math.PI * 2;
  const s: Snake = {
    isBot,
    dead: false,
    hue,
    x: p.x,
    y: p.y,
    angle,
    target: angle,
    len: BASE_LEN,
    speed: SPEED,
    boosting: false,
    path: [],
    body: [],
    radius: BASE_R,
    aiTimer: 0,
    aiTurn: 0,
  };
  // Seed the path so the body has somewhere to trail from.
  for (let i = 0; i < 40; i++) {
    s.path.push({ x: p.x - Math.cos(angle) * i * 4, y: p.y - Math.sin(angle) * i * 4 });
  }
  return s;
}

// Scatter a dead snake's mass back into the arena as a line of orbs.
function spillFood(s: Snake): void {
  const step = Math.max(1, Math.floor(s.body.length / 60));
  for (let i = 0; i < s.body.length; i += step) {
    const b = s.body[i];
    spawnFood(b.x + (Math.random() - 0.5) * 12, b.y + (Math.random() - 0.5) * 12, s.hue, 2);
  }
}

/* ============================ Game setup ============================ */
function reset(): void {
  foods = [];
  snakes = [];
  fillFood();
  player = makeSnake(false, 140);
  snakes.push(player);
  for (let i = 0; i < BOT_COUNT; i++) {
    snakes.push(makeSnake(true, HUES[i % HUES.length]));
  }
  ui.setStat("length", 0);
  ui.setStat("rank", `1 / ${snakes.length}`);
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
  const score = Math.floor(player.len);
  if (score > best) {
    best = score;
    store.save({ best });
    ui.setStat("best", best);
  }
  showGameOver();
}

function showGameOver(): void {
  overlay.classList.remove("hidden");
  renderOverlay();
}

function renderOverlay(): void {
  const t = MG.i18n.t;
  if (state === STATE_DEAD) {
    overlayTitle.textContent = `🪱 ${t("title")}`;
    overlayHint.innerHTML = t("gameover");
    overlayScore.hidden = false;
    overlayScore.innerHTML = `${t("lengthLabel")} <b>${Math.floor(player.len)}</b><br>${t("bestLabel")} <b>${best}</b>`;
    overlayAction.textContent = t("playAgain");
  } else {
    overlayTitle.textContent = `🪱 ${t("title")}`;
    overlayHint.innerHTML = t("hint");
    overlayScore.hidden = true;
    overlayAction.textContent = t("play");
  }
}
MG.i18n.onChange(() => {
  if (!overlay.classList.contains("hidden")) renderOverlay();
});

function flashStat(key: string): void {
  const e = ui.stat(key);
  if (!e) return;
  e.classList.remove("mg-flash");
  void e.offsetWidth;
  e.classList.add("mg-flash");
}

/* ============================ Simulation ============================ */
// Pointer steering: aim the player toward the cursor / touch point.
let aimAngle: number | null = null;
let keyDir = { x: 0, y: 0 };
let boostHeld = false;

function botThink(s: Snake, dt: number): void {
  s.aiTimer -= dt;
  if (s.aiTimer <= 0) {
    s.aiTimer = 0.25 + Math.random() * 0.4;

    // Default: gently wander.
    let goalX = s.x + Math.cos(s.angle) * 200;
    let goalY = s.y + Math.sin(s.angle) * 200;

    // Seek the nearest orb within sight.
    let bestD = 360 * 360;
    for (let i = 0; i < foods.length; i += 3) {
      const f = foods[i];
      const dx = f.x - s.x;
      const dy = f.y - s.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        goalX = f.x;
        goalY = f.y;
      }
    }

    s.target = Math.atan2(goalY - s.y, goalX - s.x);

    // Bots boost occasionally when long enough, to feel alive.
    s.boosting = s.len > BOOST_MIN_LEN + 20 && Math.random() < 0.08;
  }

  // Steer back from the wall before it's too late.
  const dist = Math.hypot(s.x, s.y);
  if (dist > WORLD_R * 0.86) {
    s.target = Math.atan2(-s.y, -s.x);
    s.boosting = false;
  }

  // Avoid ploughing straight into another snake's body just ahead.
  const aheadX = s.x + Math.cos(s.angle) * (s.radius + 34);
  const aheadY = s.y + Math.sin(s.angle) * (s.radius + 34);
  for (const o of snakes) {
    if (o === s || o.dead) continue;
    const step = Math.max(1, Math.floor(o.body.length / 40));
    for (let i = 0; i < o.body.length; i += step) {
      const b = o.body[i];
      const dx = aheadX - b.x;
      const dy = aheadY - b.y;
      if (dx * dx + dy * dy < (o.radius + s.radius + 10) ** 2) {
        s.target = s.angle + (s.aiTurn || 1) * 1.1;
        s.aiTurn = s.aiTurn || (Math.random() < 0.5 ? -1 : 1);
        s.boosting = false;
        break;
      }
    }
  }
}

function steer(s: Snake, dt: number): void {
  s.angle = angleLerp(s.angle, s.target, TURN_RATE * dt);

  // Boosting drains length and dribbles orbs out of the tail.
  let speed = SPEED;
  if (s.boosting && s.len > BOOST_MIN_LEN) {
    speed = BOOST_SPEED;
    s.len -= BOOST_DRAIN * dt;
    if (Math.random() < dt * 7) {
      const tail = s.body[s.body.length - 1];
      if (tail) spawnFood(tail.x, tail.y, s.hue, 1);
    }
  }
  s.speed = speed;
  s.radius = radiusFor(s.len);

  s.x += Math.cos(s.angle) * speed * dt;
  s.y += Math.sin(s.angle) * speed * dt;

  s.path.unshift({ x: s.x, y: s.y });
  trimPath(s);
  resolveBody(s);
}

function eatFood(s: Snake): void {
  const reach = s.radius + 14;
  const reach2 = reach * reach;
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    const dx = f.x - s.x;
    const dy = f.y - s.y;
    if (dx * dx + dy * dy < reach2) {
      s.len += f.val;
      foods[i] = foods[foods.length - 1];
      foods.pop();
      if (s === player) {
        ui.setStat("length", Math.floor(player.len));
        flashStat("length");
      }
    }
  }
}

// A snake dies if its head touches another living snake's body.
function checkCollisions(s: Snake): boolean {
  // Arena wall.
  if (Math.hypot(s.x, s.y) > WORLD_R - s.radius) return true;

  for (const o of snakes) {
    if (o === s || o.dead) continue;
    const hitR = s.radius * 0.7 + o.radius;
    const hitR2 = hitR * hitR;
    const step = Math.max(1, Math.floor(o.body.length / 90));
    // Skip the first couple of segments — that's the rival's own head ball,
    // a head-on tie shouldn't kill both unfairly on the very tip.
    for (let i = 2; i < o.body.length; i += step) {
      const b = o.body[i];
      const dx = s.x - b.x;
      const dy = s.y - b.y;
      if (dx * dx + dy * dy < hitR2) return true;
    }
  }
  return false;
}

function updateRank(): void {
  let rank = 1;
  const pl = player.len;
  for (const s of snakes) {
    if (!s.dead && s !== player && s.len > pl) rank++;
  }
  ui.setStat("rank", `${rank} / ${snakes.length}`);
}

function update(dt: number): void {
  if (state !== STATE_PLAY) return;

  // Player heading: pointer aim wins; otherwise keyboard direction.
  if (aimAngle !== null) {
    player.target = aimAngle;
  } else if (keyDir.x !== 0 || keyDir.y !== 0) {
    player.target = Math.atan2(keyDir.y, keyDir.x);
  }
  player.boosting = boostHeld;

  for (const s of snakes) {
    if (s.dead) continue;
    if (s.isBot) botThink(s, dt);
    steer(s, dt);
  }

  // Eating + collisions resolved after everyone has moved this frame.
  for (const s of snakes) {
    if (s.dead) continue;
    eatFood(s);
  }
  for (const s of snakes) {
    if (s.dead) continue;
    if (checkCollisions(s)) {
      s.dead = true;
      spillFood(s);
      if (s === player) {
        die();
      }
    }
  }

  // Respawn fallen bots so the arena stays busy, and top up the orbs.
  if (state === STATE_PLAY) {
    for (let i = 0; i < snakes.length; i++) {
      const s = snakes[i];
      if (s.dead && s.isBot) {
        snakes[i] = makeSnake(true, HUES[i % HUES.length]);
      }
    }
  }
  fillFood();
  updateRank();
}

/* ============================ Rendering ============================ */
let viewW = 0;
let viewH = 0;
let dpr = 1;
let zoom = 1;

function resize(): void {
  const area = canvas.parentNode as HTMLElement;
  viewW = area.clientWidth;
  viewH = area.clientHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  const mdpr = dpr;
  minimap.width = Math.round(96 * mdpr);
  minimap.height = Math.round(96 * mdpr);
}

function draw(): void {
  const cam = player; // camera centres on the player's head
  zoom = Math.max(0.62, 1 - (player.radius - BASE_R) * 0.012);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sc = zoom * dpr;
  const ox = canvas.width / 2 - cam.x * sc;
  const oy = canvas.height / 2 - cam.y * sc;
  ctx.setTransform(sc, 0, 0, sc, ox, oy);

  // Visible world bounds (for culling).
  const halfW = canvas.width / 2 / sc;
  const halfH = canvas.height / 2 / sc;
  const minX = cam.x - halfW - 30;
  const maxX = cam.x + halfW + 30;
  const minY = cam.y - halfH - 30;
  const maxY = cam.y + halfH + 30;

  drawBackground(minX, maxX, minY, maxY);

  // Orbs.
  for (const f of foods) {
    if (f.x < minX || f.x > maxX || f.y < minY || f.y > maxY) continue;
    ctx.fillStyle = `hsl(${f.hue}, 90%, 62%)`;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Snakes (player drawn last so it sits on top).
  for (const s of snakes) {
    if (!s.dead && s !== player) drawSnake(s, minX, maxX, minY, maxY);
  }
  if (!player.dead) drawSnake(player, minX, maxX, minY, maxY);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawMinimap();
}

function drawBackground(minX: number, maxX: number, minY: number, maxY: number): void {
  // Grid.
  const grid = 80;
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.beginPath();
  for (let x = Math.floor(minX / grid) * grid; x <= maxX; x += grid) {
    ctx.moveTo(x, minY);
    ctx.lineTo(x, maxY);
  }
  for (let y = Math.floor(minY / grid) * grid; y <= maxY; y += grid) {
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
  }
  ctx.stroke();

  // Arena boundary — a glowing red ring you must not cross.
  ctx.lineWidth = 8 / zoom;
  ctx.strokeStyle = "rgba(255,70,70,0.55)";
  ctx.beginPath();
  ctx.arc(0, 0, WORLD_R, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSnake(s: Snake, minX: number, maxX: number, minY: number, maxY: number): void {
  const body = s.body;
  if (body.length === 0) return;
  const r = s.radius;
  const fill = `hsl(${s.hue}, 70%, 55%)`;
  const rim = `hsl(${s.hue}, 70%, 38%)`;

  // Draw tail → head so the head circle ends up on top.
  for (let i = body.length - 1; i >= 0; i--) {
    const b = body[i];
    if (b.x < minX - r || b.x > maxX + r || b.y < minY - r || b.y > maxY + r) continue;
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes on the head.
  const head = body[0];
  const px = -Math.sin(s.angle);
  const py = Math.cos(s.angle);
  const fx = Math.cos(s.angle);
  const fy = Math.sin(s.angle);
  const eo = r * 0.45;
  const ef = r * 0.35;
  const er = r * 0.34;
  for (const sgn of [-1, 1]) {
    const ex = head.x + fx * ef + px * eo * sgn;
    const ey = head.y + fy * ef + py * eo * sgn;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#101418";
    ctx.beginPath();
    ctx.arc(ex + fx * er * 0.4, ey + fy * er * 0.4, er * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMinimap(): void {
  const W = minimap.width;
  const H = minimap.height;
  mctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const scale = W / 2 / WORLD_R;

  mctx.fillStyle = "rgba(255,70,70,0.18)";
  mctx.beginPath();
  mctx.arc(cx, cy, (W / 2) * 0.98, 0, Math.PI * 2);
  mctx.fill();

  for (const s of snakes) {
    if (s.dead) continue;
    const isPlayer = s === player;
    mctx.fillStyle = isPlayer ? "#ffffff" : `hsl(${s.hue}, 70%, 60%)`;
    mctx.beginPath();
    mctx.arc(cx + s.x * scale, cy + s.y * scale, isPlayer ? 3.2 : 2, 0, Math.PI * 2);
    mctx.fill();
  }
}

/* ============================ Loop ============================ */
function loop(now: number): void {
  if (!lastTime) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05; // clamp after a tab switch

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ============================ Input ============================ */
function pointerToAngle(clientX: number, clientY: number): number {
  const rect = canvas.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  return Math.atan2(dy, dx);
}

canvas.addEventListener("mousemove", (e: MouseEvent) => {
  aimAngle = pointerToAngle(e.clientX, e.clientY);
});
canvas.addEventListener("mousedown", (e: MouseEvent) => {
  if (state !== STATE_PLAY) {
    startGame();
    return;
  }
  aimAngle = pointerToAngle(e.clientX, e.clientY);
  boostHeld = true;
  e.preventDefault();
});
window.addEventListener("mouseup", () => {
  boostHeld = false;
});

// Touch: drag anywhere to steer; the boost button handles boosting.
canvas.addEventListener(
  "touchstart",
  (e: TouchEvent) => {
    if (state !== STATE_PLAY) {
      startGame();
      return;
    }
    const t = e.changedTouches[0];
    aimAngle = pointerToAngle(t.clientX, t.clientY);
    e.preventDefault();
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (e: TouchEvent) => {
    const t = e.changedTouches[0];
    aimAngle = pointerToAngle(t.clientX, t.clientY);
    e.preventDefault();
  },
  { passive: false },
);

function pressBoost(on: boolean): void {
  boostHeld = on;
  boostBtn.classList.toggle("active", on);
}
boostBtn.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    if (state !== STATE_PLAY) startGame();
    pressBoost(true);
  },
  { passive: false },
);
boostBtn.addEventListener(
  "touchend",
  (e) => {
    e.preventDefault();
    pressBoost(false);
  },
  { passive: false },
);
boostBtn.addEventListener("mousedown", (e) => {
  e.preventDefault();
  if (state !== STATE_PLAY) startGame();
  pressBoost(true);
});
window.addEventListener("mouseup", () => pressBoost(false));

// Keyboard: arrow keys / WASD steer, space boosts.
const keys = new Set<string>();
function recomputeKeyDir(): void {
  let x = 0;
  let y = 0;
  if (keys.has("ArrowLeft") || keys.has("a")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) x += 1;
  if (keys.has("ArrowUp") || keys.has("w")) y -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) y += 1;
  keyDir = { x, y };
  if (x !== 0 || y !== 0) aimAngle = null; // hand control to the keyboard
}
window.addEventListener("keydown", (e: KeyboardEvent) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === " " || k === "Enter") {
    if (state !== STATE_PLAY) startGame();
    else boostHeld = true;
    e.preventDefault();
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"].includes(k)) {
    keys.add(k);
    recomputeKeyDir();
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e: KeyboardEvent) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === " " || k === "Enter") boostHeld = false;
  if (keys.delete(k)) recomputeKeyDir();
});

// Tap the overlay to (re)start.
function onOverlayTap(e: Event): void {
  e.preventDefault();
  if (state !== STATE_PLAY) startGame();
}
overlay.addEventListener("mousedown", onOverlayTap);
overlay.addEventListener("touchstart", onOverlayTap, { passive: false });

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));

/* ============================ Boot ============================ */
resize();
showReady();
requestAnimationFrame(loop);

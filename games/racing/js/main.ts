import { MG } from "../../../shared/mg";
import type { HeaderUI, SaveStore } from "../../../shared/types";

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "Racing",
    best: "Best",
    speed: "km/h",
    hint: "Arrows / WASD to steer · ▲ gas · ▼ brake<br>On phone, use the on-screen pads",
    gameover: "Crashed!",
    scoreLabel: "Distance",
    bestLabel: "Best",
    play: "▶ Drive",
    playAgain: "▶ Drive again",
    unit: "m",
  },
  ru: {
    title: "Гонки",
    best: "Рекорд",
    speed: "км/ч",
    hint: "Стрелки / WASD — руль · ▲ газ · ▼ тормоз<br>На телефоне — экранные кнопки",
    gameover: "Авария!",
    scoreLabel: "Дистанция",
    bestLabel: "Рекорд",
    play: "▶ Поехали",
    playAgain: "▶ Ещё раз",
    unit: "м",
  },
  es: {
    title: "Carreras",
    best: "Mejor",
    speed: "km/h",
    hint: "Flechas / WASD para girar · ▲ acelerar · ▼ frenar<br>En móvil, usa los botones",
    gameover: "¡Choque!",
    scoreLabel: "Distancia",
    bestLabel: "Mejor",
    play: "▶ Conducir",
    playAgain: "▶ Otra vez",
    unit: "m",
  },
});

const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const overlay = $("overlay");
const overlayTitle = $("overlay-title");
const overlayHint = $("overlay-hint");
const overlayScore = $("overlay-score") as HTMLElement & { hidden: boolean };
const overlayAction = $("overlay-action");

// Shared header: brand + language selector + Best & Speed stat chips.
const ui: HeaderUI = MG.mountHeader({
  icon: "🏎️",
  titleKey: "title",
  stats: [
    { key: "spd", labelKey: "speed", variant: "sm", value: "0" },
    { key: "best", labelKey: "best" },
  ],
});

/* ===================== Pseudo-3D road engine =====================
 * Classic projection: the road is a list of fixed-length segments.
 * Each segment has a world position (x curve offset, y hill height,
 * z depth). We project each segment from camera space to screen space
 * and draw it back-to-front as a trapezoid, giving real perspective,
 * curves and hills on a plain 2D canvas.
 */

// Logical resolution — drawn at this size, scaled to fit the stage.
const W = 480;
const H = 720;
let viewScale = 1;

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(rect.width / W, rect.height / H);
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  viewScale = scale * dpr;
}

// --- Engine constants ---
const SEG_LEN = 200; // length of a single segment (world units)
const RUMBLE_LEN = 3; // segments per rumble-strip stripe
const ROAD_WIDTH = 2000; // half-width of the road at z = 0
const LANES = 3;
const CAM_HEIGHT = 1000; // camera height above the road
const CAM_DEPTH = 1 / Math.tan(((100 / 2) * Math.PI) / 180); // ~fov 100
const DRAW_DIST = 220; // segments rendered ahead
const FOG_DENSITY = 5;

const CENTRIFUGAL = 0.32; // how hard curves push the car sideways
const MAX_SPEED = SEG_LEN * 60; // top speed (world units / sec)
const ACCEL = MAX_SPEED / 5;
const BRAKE = -MAX_SPEED;
const DECEL = -MAX_SPEED / 5; // natural deceleration (off-throttle)
const OFFROAD_DECEL = -MAX_SPEED / 2;
const OFFROAD_LIMIT = MAX_SPEED / 4;

// --- Types ---
interface SegColor {
  road: string;
  grass: string;
  rumble: string;
  lane: string | null;
}

interface WorldPoint {
  x?: number;
  y: number;
  z: number;
}

// camera/screen fields are filled in by project() each frame; they start at 0.
interface CameraPoint {
  x: number;
  y: number;
  z: number;
}

interface ScreenPoint {
  scale: number;
  x: number;
  y: number;
  w: number;
}

interface SegPoint {
  world: WorldPoint;
  camera: CameraPoint;
  screen: ScreenPoint;
}

interface Segment {
  index: number;
  curve: number;
  p1: SegPoint;
  p2: SegPoint;
  color: SegColor;
  cars: TrafficCar[];
  sprites: unknown[];
  // Set each frame while the segment is in the drawn range.
  looped: boolean;
  fog: number;
}

interface TrafficCar {
  offset: number;
  z: number;
  speed: number;
  color: string;
  w: number;
  percent?: number;
}

// Colors for the two alternating segment shades.
const COL: {
  light: SegColor;
  dark: SegColor;
  start: SegColor;
  finish: SegColor;
} = {
  light: { road: "#6b6b76", grass: "#27a84a", rumble: "#ffffff", lane: "#ffffff" },
  dark: { road: "#62626d", grass: "#229642", rumble: "#bd2a2a", lane: null },
  start: { road: "#fff", grass: "#27a84a", rumble: "#fff", lane: null },
  finish: { road: "#111", grass: "#27a84a", rumble: "#111", lane: null },
};

// --- State ---
const STATE_READY = 0;
const STATE_PLAY = 1;
const STATE_DEAD = 2;
let state = STATE_READY;

let segments: Segment[] = [];
let trackLength = 0;
let position: number; // camera Z position along the track
let playerX: number; // -1..1 horizontal offset (1 = right edge of road)
let speed: number; // current speed
let distance: number; // metres travelled (score)
let best: number;
let cars: TrafficCar[]; // traffic
let deadTimer: number;
let shake: number;

interface SaveData {
  best: number;
}

const store: SaveStore<SaveData> = MG.storage("racing", { version: 1 });
best = (store.load() || { best: 0 }).best;
ui.setStat("best", best);

/* ---------------- Track building ---------------- */
function lastY(): number {
  return segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y;
}

function addSegment(curve: number, y: number): void {
  const n = segments.length;
  const prevY = lastY();
  segments.push({
    index: n,
    curve: curve,
    p1: {
      world: { y: prevY, z: n * SEG_LEN },
      camera: { x: 0, y: 0, z: 0 },
      screen: { scale: 0, x: 0, y: 0, w: 0 },
    },
    p2: {
      world: { y: y, z: (n + 1) * SEG_LEN },
      camera: { x: 0, y: 0, z: 0 },
      screen: { scale: 0, x: 0, y: 0, w: 0 },
    },
    color: Math.floor(n / RUMBLE_LEN) % 2 ? COL.dark : COL.light,
    cars: [],
    sprites: [],
    looped: false,
    fog: 0,
  });
}

function easeIn(a: number, b: number, p: number): number {
  return a + (b - a) * p ** 2;
}
function easeInOut(a: number, b: number, p: number): number {
  return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
}

function addRoad(enter: number, hold: number, leave: number, curve: number, y: number): void {
  const startY = lastY();
  const endY = startY + y * SEG_LEN;
  const total = enter + hold + leave;
  let i: number;
  for (i = 0; i < enter; i++)
    addSegment(easeIn(0, curve, i / enter), easeInOut(startY, endY, i / total));
  for (i = 0; i < hold; i++) addSegment(curve, easeInOut(startY, endY, (enter + i) / total));
  for (i = 0; i < leave; i++)
    addSegment(easeInOut(curve, 0, i / leave), easeInOut(startY, endY, (enter + hold + i) / total));
}

// Random track of straights, curves and hills.
function buildTrack(): void {
  segments = [];

  addRoad(20, 20, 20, 0, 0); // gentle start straight

  const pieces = 60;
  for (let p = 0; p < pieces; p++) {
    const enter = pick([25, 50, 50, 100]);
    const hold = pick([25, 50, 75]);
    const leave = pick([25, 50, 50]);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const curveMag = pick([0, 0, 2, 3, 4, 5, 6]);
    const hillMag = pick([-4, -2, 0, 0, 2, 4, 5]);
    addRoad(enter, hold, leave, dir * curveMag, hillMag);
  }

  // Mark a few start segments for the start line look.
  for (let s = 0; s < segments.length; s++) {
    if (s < 4) segments[s].color = COL.start;
  }
  trackLength = segments.length * SEG_LEN;
}

function pick(arr: number[]): number {
  return arr[Math.floor(Math.random() * arr.length)];
}

function findSegment(z: number): Segment {
  return segments[Math.floor(z / SEG_LEN) % segments.length];
}

/* ---------------- Traffic ---------------- */
const CAR_COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#ecf0f1"];

function resetTraffic(): void {
  cars = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const lane = Math.floor(Math.random() * LANES) - (LANES - 1) / 2;
    const offset = lane * (1.6 / LANES);
    let z = Math.floor(Math.random() * segments.length) * SEG_LEN;
    // Skip the very start so the player has room.
    if (z < 40 * SEG_LEN) z += 40 * SEG_LEN;
    const carSpeed = MAX_SPEED / 4 + Math.random() * (MAX_SPEED / 3);
    cars.push({
      offset: offset,
      z: z % trackLength,
      speed: carSpeed,
      color: CAR_COLORS[i % CAR_COLORS.length],
      w: 0,
    });
  }
}

function updateCars(dt: number): void {
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    // Simple avoidance: steer away from the player when close ahead.
    c.z = increase(c.z, dt * c.speed, trackLength);
    c.percent = (c.z % SEG_LEN) / SEG_LEN;
  }
}

function increase(start: number, inc: number, max: number): number {
  let r = start + inc;
  while (r >= max) r -= max;
  while (r < 0) r += max;
  return r;
}

/* ---------------- Game flow ---------------- */
function reset(): void {
  buildTrack();
  resetTraffic();
  position = 0;
  playerX = 0;
  speed = 0;
  distance = 0;
  deadTimer = 0;
  shake = 0;
  ui.setStat("spd", 0);
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
  shake = 22;
  const d = Math.floor(distance);
  if (d > best) {
    best = d;
    store.save({ best: best });
    ui.setStat("best", best);
  }
}

function showGameOver(): void {
  overlay.classList.remove("hidden");
  renderOverlay();
}

function action(): void {
  if (state === STATE_READY) startGame();
  else if (state === STATE_DEAD && deadTimer > 24) showReady();
}

function renderOverlay(): void {
  const t = MG.i18n.t;
  if (state === STATE_DEAD) {
    overlayTitle.textContent = `🏁 ${t("title")}`;
    overlayHint.textContent = t("gameover");
    overlayScore.hidden = false;
    overlayScore.innerHTML = `${t("scoreLabel")} <b>${Math.floor(distance)} ${t(
      "unit",
    )}</b><br>${t("bestLabel")} <b>${best} ${t("unit")}</b>`;
    overlayAction.textContent = t("playAgain");
  } else {
    overlayTitle.textContent = `🏎️ ${t("title")}`;
    overlayHint.innerHTML = t("hint");
    overlayScore.hidden = true;
    overlayAction.textContent = t("play");
  }
}
MG.i18n.onChange(() => {
  if (!overlay.classList.contains("hidden")) renderOverlay();
});

/* ---------------- Input ---------------- */
const keys = { left: false, right: false, gas: false, brake: false };

function setKey(code: string, down: boolean): boolean {
  switch (code) {
    case "ArrowLeft":
    case "KeyA":
      keys.left = down;
      return true;
    case "ArrowRight":
    case "KeyD":
      keys.right = down;
      return true;
    case "ArrowUp":
    case "KeyW":
      keys.gas = down;
      return true;
    case "ArrowDown":
    case "KeyS":
      keys.brake = down;
      return true;
    case "Space":
      return true;
  }
  return false;
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    action();
  }
  if (setKey(e.code, true)) e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  if (setKey(e.code, false)) e.preventDefault();
});

// On-screen pads.
function bindPad(el: HTMLElement, prop: "left" | "right" | "gas" | "brake"): void {
  function on(e: Event): void {
    e.preventDefault();
    keys[prop] = true;
    el.classList.add("down");
  }
  function off(e: Event): void {
    e.preventDefault();
    keys[prop] = false;
    el.classList.remove("down");
  }
  el.addEventListener("touchstart", on, { passive: false });
  el.addEventListener("touchend", off, { passive: false });
  el.addEventListener("touchcancel", off, { passive: false });
  el.addEventListener("mousedown", on);
  el.addEventListener("mouseup", off);
  el.addEventListener("mouseleave", off);
}
bindPad($("pad-left"), "left");
bindPad($("pad-right"), "right");
bindPad($("pad-gas"), "gas");
bindPad($("pad-brake"), "brake");

// Tapping the canvas / overlay also accelerates / advances screens.
function onTap(e: Event): void {
  e.preventDefault();
  if (state !== STATE_PLAY) action();
}
canvas.addEventListener("mousedown", onTap);
canvas.addEventListener("touchstart", onTap, { passive: false });
overlay.addEventListener("mousedown", onTap);
overlay.addEventListener("touchstart", onTap, { passive: false });

window.addEventListener("resize", resize);

/* ---------------- Update ---------------- */
function update(dt: number): void {
  if (state === STATE_PLAY) {
    updateCars(dt);

    const playerSeg = findSegment(position + 1);
    const speedPercent = speed / MAX_SPEED;
    const dx = dt * 2 * speedPercent; // steering responsiveness scales with speed

    position = increase(position, dt * speed, trackLength);

    // Steering.
    if (keys.left) playerX -= dx;
    else if (keys.right) playerX += dx;

    // Centrifugal force pushes outward on curves.
    playerX -= dx * speedPercent * playerSeg.curve * CENTRIFUGAL;

    // Throttle / brake.
    if (keys.gas) speed += ACCEL * dt;
    else if (keys.brake) speed += BRAKE * dt;
    else speed += DECEL * dt;

    // Off-road: slow down and rumble.
    if ((playerX < -1 || playerX > 1) && speed > OFFROAD_LIMIT) {
      speed += OFFROAD_DECEL * dt;
      shake = Math.max(shake, 3);
    }

    playerX = Math.max(-2, Math.min(2, playerX));
    speed = Math.max(0, Math.min(speed, MAX_SPEED));

    // Distance / score.
    distance += (speed * dt) / 100;

    // Collision with traffic.
    checkCollisions(playerSeg);

    shake *= 0.9;
    ui.setStat("spd", Math.round((speed / MAX_SPEED) * 320));
  } else if (state === STATE_DEAD) {
    deadTimer++;
    speed *= 0.9;
    position = increase(position, dt * speed, trackLength);
    shake *= 0.88;
    if (deadTimer === 22) showGameOver();
  } else if (state === STATE_READY) {
    // Idle camera drift forward for a lively title screen.
    position = increase(position, (dt * MAX_SPEED) / 8, trackLength);
  }

  // background follows curve in render (bgOffset was a no-op accumulator)
}

// PLAYER_W = 0.7 — player half-width in road-width units (approx)
// pW = 80 / ROAD_WIDTH — approximate collision half-width
function checkCollisions(_playerSeg: Segment): void {
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    // Only cars within a couple segments ahead matter.
    const cz = c.z;
    const pz = position;
    let rel = cz - pz;
    if (rel < 0) rel += trackLength;
    if (rel < SEG_LEN * 1.6 && rel > -SEG_LEN * 0.4) {
      if (overlapX(playerX, 0.5, c.offset, 0.4)) {
        die();
        // Knock the player back a touch.
        speed = speed / 4;
        return;
      }
    }
  }
}

function overlapX(x1: number, w1: number, x2: number, w2: number): boolean {
  return Math.abs(x1 - x2) < (w1 + w2) / 2;
}

/* ---------------- Projection + render ---------------- */
function project(
  p: SegPoint,
  camX: number,
  camY: number,
  camZ: number,
  camDepth: number,
  width: number,
  height: number,
  roadWidth: number,
): void {
  p.camera.x = (p.world.x || 0) - camX;
  p.camera.y = (p.world.y || 0) - camY;
  p.camera.z = (p.world.z || 0) - camZ;
  p.screen.scale = camDepth / p.camera.z;
  p.screen.x = Math.round(width / 2 + (p.screen.scale * p.camera.x * width) / 2);
  p.screen.y = Math.round(height / 2 - (p.screen.scale * p.camera.y * height) / 2);
  p.screen.w = Math.round((p.screen.scale * roadWidth * width) / 2);
}

function draw(): void {
  const sx = shake ? (Math.random() - 0.5) * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * shake : 0;

  ctx.save();
  ctx.scale(viewScale, viewScale);
  ctx.save();
  ctx.translate(sx, sy);

  const baseSeg = findSegment(position);
  const basePercent = (position % SEG_LEN) / SEG_LEN;
  const playerSeg = findSegment(position + 1);
  const playerPercent = (position % SEG_LEN) / SEG_LEN;
  const playerY = interpolate(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPercent);

  // Sky + background.
  drawBackground(baseSeg.curve, playerY);

  let maxY = H;
  let x = 0;
  let dx = -(baseSeg.curve * basePercent);

  const camX = playerX * ROAD_WIDTH;
  let n: number;
  let seg: Segment;
  for (n = 0; n < DRAW_DIST; n++) {
    seg = segments[(baseSeg.index + n) % segments.length];
    seg.looped = baseSeg.index + n >= segments.length;
    seg.fog = fog(n / DRAW_DIST, FOG_DENSITY);

    const camZ = position - (seg.looped ? trackLength : 0);

    project(seg.p1, camX - x, playerY + CAM_HEIGHT, camZ, CAM_DEPTH, W, H, ROAD_WIDTH);
    project(seg.p2, camX - x - dx, playerY + CAM_HEIGHT, camZ, CAM_DEPTH, W, H, ROAD_WIDTH);

    x += dx;
    dx += seg.curve;

    if (
      seg.p1.camera.z <= CAM_DEPTH ||
      seg.p2.screen.y >= seg.p1.screen.y ||
      seg.p2.screen.y >= maxY
    ) {
      continue;
    }

    drawSegment(seg);
    maxY = seg.p1.screen.y;
  }

  // Traffic — draw the cars that fall in the drawn range, far to near.
  drawTraffic(baseSeg, playerY);

  // Player car.
  drawPlayer();

  ctx.restore();
  ctx.restore();
}

function interpolate(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function fog(d: number, density: number): number {
  return 1 / Math.E ** (d * d * density);
}

function drawSegment(seg: Segment): void {
  const c = seg.color;
  const p1 = seg.p1.screen;
  const p2 = seg.p2.screen;
  const r1 = rumbleWidth(p1.w);
  const r2 = rumbleWidth(p2.w);
  const l1 = laneWidth(p1.w);
  const l2 = laneWidth(p2.w);

  // Grass.
  ctx.fillStyle = c.grass;
  ctx.fillRect(0, p2.y, W, p1.y - p2.y);

  // Rumble strips.
  polygon(
    p1.x - p1.w - r1,
    p1.y,
    p1.x - p1.w,
    p1.y,
    p2.x - p2.w,
    p2.y,
    p2.x - p2.w - r2,
    p2.y,
    c.rumble,
  );
  polygon(
    p1.x + p1.w + r1,
    p1.y,
    p1.x + p1.w,
    p1.y,
    p2.x + p2.w,
    p2.y,
    p2.x + p2.w + r2,
    p2.y,
    c.rumble,
  );

  // Road.
  polygon(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, c.road);

  // Lane markers.
  if (c.lane) {
    const lanew1 = (p1.w * 2) / LANES;
    const lanew2 = (p2.w * 2) / LANES;
    let lx1 = p1.x - p1.w + lanew1;
    let lx2 = p2.x - p2.w + lanew2;
    for (let lane = 1; lane < LANES; lx1 += lanew1, lx2 += lanew2, lane++) {
      polygon(
        lx1 - l1 / 2,
        p1.y,
        lx1 + l1 / 2,
        p1.y,
        lx2 + l2 / 2,
        p2.y,
        lx2 - l2 / 2,
        p2.y,
        c.lane,
      );
    }
  }

  // Fog overlay.
  if (seg.fog < 1) {
    ctx.globalAlpha = 1 - seg.fog;
    ctx.fillStyle = FOG_COLOR;
    ctx.fillRect(0, p2.y, W, p1.y - p2.y);
    ctx.globalAlpha = 1;
  }
}

const FOG_COLOR = "#74b9ff";

function rumbleWidth(projectedW: number): number {
  return projectedW / 6;
}
function laneWidth(projectedW: number): number {
  return projectedW / 32;
}

function polygon(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function drawBackground(curve: number, playerY: number): void {
  // Sky gradient.
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, "#3a7bd5");
  sky.addColorStop(1, "#74b9ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Distant hills, shifted by the upcoming curve for a parallax feel.
  const horizon = H * 0.42 + playerY * 0.0008;
  const shift = curve * 6;
  ctx.fillStyle = "#5fa86a";
  for (let i = -1; i < 5; i++) {
    const hx = i * 160 - shift;
    hill(hx, horizon, 160, 70);
  }
  ctx.fillStyle = "#4f9a5c";
  for (let j = -1; j < 6; j++) {
    const hx2 = j * 120 - shift * 1.6 + 40;
    hill(hx2, horizon + 14, 120, 44);
  }

  // Sun glow.
  const sun = ctx.createRadialGradient(W * 0.7, horizon - 60, 6, W * 0.7, horizon - 60, 90);
  sun.addColorStop(0, "rgba(255,250,210,0.95)");
  sun.addColorStop(1, "rgba(255,250,210,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(W * 0.7 - 90, horizon - 150, 180, 180);
}

function hill(cx: number, baseY: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, baseY);
  ctx.quadraticCurveTo(cx, baseY - h, cx + w / 2, baseY);
  ctx.closePath();
  ctx.fill();
}

interface VisibleCar {
  c: TrafficCar;
  rel: number;
  sx: number;
  sy: number;
  scale: number;
  fog: number;
}

function drawTraffic(_baseSeg: Segment, _playerY: number): void {
  // Place each car on its segment, reusing the segment's freshly
  // projected p1/p2 screen points (which already include the road
  // curve), so traffic follows bends correctly. Draw far→near.
  const visible: VisibleCar[] = [];
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    let rel = c.z - position;
    if (rel < 0) rel += trackLength;
    if (rel <= SEG_LEN || rel > (DRAW_DIST - 2) * SEG_LEN) continue;

    const seg = segments[Math.floor(c.z / SEG_LEN) % segments.length];
    // Segment must have been projected this frame (has a valid scale).
    if (!seg.p1.screen?.scale || seg.p1.screen.scale <= 0) continue;

    const pct = (c.z % SEG_LEN) / SEG_LEN;
    const scale = interpolate(seg.p1.screen.scale, seg.p2.screen.scale, pct);
    const roadX = interpolate(seg.p1.screen.x, seg.p2.screen.x, pct);
    const roadW = interpolate(seg.p1.screen.w, seg.p2.screen.w, pct);
    const sy = interpolate(seg.p1.screen.y, seg.p2.screen.y, pct);
    // Offset across the road: c.offset is in road-half-width units.
    const sx = roadX + c.offset * roadW;
    visible.push({ c: c, rel: rel, sx: sx, sy: sy, scale: scale, fog: seg.fog });
  }
  visible.sort((a, b) => b.rel - a.rel);
  for (let k = 0; k < visible.length; k++) {
    const v = visible[k];
    const w = ((v.scale * ROAD_WIDTH * W) / 2) * 0.42;
    if (w < 2) continue;
    carSprite(v.sx, v.sy, w, w * 0.78, v.c.color);
    if (v.fog < 1) {
      ctx.globalAlpha = 1 - v.fog;
      ctx.fillStyle = FOG_COLOR;
      ctx.fillRect(v.sx - w / 2, v.sy - w * 0.78, w, w * 0.78);
      ctx.globalAlpha = 1;
    }
  }
}

// A simple top-rear car sprite (works for both traffic and player).
function carSprite(cx: number, cy: number, w: number, h: number, color: string): void {
  const x = cx - w / 2;
  const y = cy - h;

  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.55, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body.
  roundRect(x, y, w, h * 0.9, Math.min(8, w * 0.16));
  ctx.fillStyle = color;
  ctx.fill();

  // Roof / window.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(x + w * 0.18, y + h * 0.12, w * 0.64, h * 0.34, Math.min(5, w * 0.1));
  ctx.fill();

  // Lower bumper shade.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x, y + h * 0.66, w, h * 0.16);

  // Tail lights.
  ctx.fillStyle = "#ffce54";
  ctx.fillRect(x + w * 0.08, y + h * 0.5, w * 0.16, h * 0.16);
  ctx.fillRect(x + w * 0.76, y + h * 0.5, w * 0.16, h * 0.16);

  // Wheels peeking out.
  ctx.fillStyle = "#111";
  ctx.fillRect(x - w * 0.04, y + h * 0.5, w * 0.1, h * 0.3);
  ctx.fillRect(x + w * 0.94, y + h * 0.5, w * 0.1, h * 0.3);
}

function drawPlayer(): void {
  const bounce = state === STATE_PLAY ? Math.sin(Date.now() / 50) * (speed / MAX_SPEED) * 1.5 : 0;
  const cx = W / 2;
  const cy = H - 70 + bounce;
  // Steer lean.
  let lean = 0;
  if (state === STATE_PLAY) {
    if (keys.left) lean = -6;
    else if (keys.right) lean = 6;
  }
  const w = 120;
  const h = 86;
  ctx.save();
  ctx.translate(cx + lean, cy);
  playerSprite(0, 0, w, h);
  ctx.restore();
}

function playerSprite(cx: number, cy: number, w: number, h: number): void {
  const x = cx - w / 2;
  const y = cy - h;

  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, w * 0.5, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rear wing.
  ctx.fillStyle = "#b8000f";
  roundRect(x + w * 0.05, y - h * 0.04, w * 0.9, h * 0.12, 4);
  ctx.fill();

  // Body.
  const grd = ctx.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, "#ff4757");
  grd.addColorStop(1, "#c0392b");
  ctx.fillStyle = grd;
  roundRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.74, 10);
  ctx.fill();

  // Cockpit.
  ctx.fillStyle = "#1b1f2a";
  roundRect(x + w * 0.28, y + h * 0.18, w * 0.44, h * 0.3, 8);
  ctx.fill();

  // White racing stripe.
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(cx - w * 0.04, y + h * 0.1, w * 0.08, h * 0.7);

  // Wheels.
  ctx.fillStyle = "#111";
  roundRect(x - w * 0.02, y + h * 0.5, w * 0.16, h * 0.38, 5);
  ctx.fill();
  roundRect(x + w * 0.86, y + h * 0.5, w * 0.16, h * 0.38, 5);
  ctx.fill();

  // Tail lights.
  ctx.fillStyle = "#ffce54";
  ctx.fillRect(x + w * 0.16, y + h * 0.58, w * 0.12, h * 0.14);
  ctx.fillRect(x + w * 0.72, y + h * 0.58, w * 0.12, h * 0.14);
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- Loop ---------------- */
let last = 0;
function loop(now: number): void {
  if (!last) last = now;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// --- Boot ---
resize();
reset();
showReady();
requestAnimationFrame(loop);

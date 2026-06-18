import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";

const $ = (id: string): HTMLElement => document.getElementById(id)!;

/* ============================ Types ============================ */
interface Point {
  x: number;
  y: number;
}

interface CarColor {
  c1: string;
  c2: string;
  c3: string;
}

interface BotDef {
  c1: string;
  c2: string;
  c3: string;
  maxMul: number;
  look: number;
}

interface SkidMark {
  x: number;
  y: number;
  a: number;
}

interface Input {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
}

interface Pose {
  x: number;
  y: number;
  angle: number;
}

interface Patch {
  x: number;
  y: number;
  r: number;
  t: number;
}

interface Car {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  speed: number;
  fwd: number;
  lat: number;
  onTrack: boolean;
  offIdx: number;
  lap: number;
  prevFrac: number;
  passedHalf: boolean;
  prog: number;
  skid: SkidMark[];
  col?: CarColor;
  maxSpeed?: number;
  look?: number;
  isBot?: boolean;
}

type CarExtra = Partial<Car>;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "Top Racer",
    lap: "Lap",
    time: "Time",
    best: "Best",
    pos: "Pos",
    hint: "Steer ◀ ▶ · ▲ gas · ▼ brake (hold while turning to drift)\nBeat the bots and chase your best lap!",
    tapStart: "▶ Start engine",
    go: "GO!",
    newBest: "New best lap! 🏁",
    bestLabel: "Best lap",
    lastLabel: "Last lap",
    restart: "Restart",
  },
  ru: {
    title: "Top Racer",
    lap: "Круг",
    time: "Время",
    best: "Рекорд",
    pos: "Место",
    hint: "Руль ◀ ▶ · ▲ газ · ▼ тормоз (держи в повороте — занос)\nОбгони ботов и побей свой лучший круг!",
    tapStart: "▶ Завести мотор",
    go: "СТАРТ!",
    newBest: "Новый рекорд круга! 🏁",
    bestLabel: "Лучший круг",
    lastLabel: "Последний круг",
    restart: "Заново",
  },
  es: {
    title: "Top Racer",
    lap: "Vuelta",
    time: "Tiempo",
    best: "Mejor",
    pos: "Pos",
    hint: "Gira ◀ ▶ · ▲ acelera · ▼ frena (mantén al girar para derrapar)\n¡Gana a los bots y bate tu mejor vuelta!",
    tapStart: "▶ Arrancar motor",
    go: "¡YA!",
    newBest: "¡Mejor vuelta! 🏁",
    bestLabel: "Mejor vuelta",
    lastLabel: "Última vuelta",
    restart: "Reiniciar",
  },
});

const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const overlay = $("overlay");
const overlayTitle = $("overlay-title");
const overlayHint = $("overlay-hint");
const overlayScore = $("overlay-score");
const overlayAction = $("overlay-action");
const flashEl = $("flash");

const ui: HeaderUI = MG.mountHeader({
  icon: "🏎️",
  titleKey: "title",
  stats: [
    { key: "pos", labelKey: "pos", value: "1/4" },
    { key: "lap", labelKey: "lap", value: "1" },
    { key: "time", labelKey: "time", variant: "sm", value: "0.00" },
    { key: "best", labelKey: "best", variant: "sm", value: "—" },
  ],
  actions: [
    {
      key: "restart",
      labelKey: "restart",
      onClick: () => {
        resetRace();
        showReady();
      },
    },
  ],
});

/* ===================== Canvas / camera sizing ===================== */
let VW = 360;
let VH = 640;
let dpr = 1;
function resize(): void {
  const rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  VW = Math.max(1, rect.width);
  VH = Math.max(1, rect.height);
  canvas.width = Math.round(VW * dpr);
  canvas.height = Math.round(VH * dpr);
}

/* ============================ Track ============================
   A closed circuit, defined by a handful of waypoints that we smooth
   into a centreline with a Catmull-Rom spline. From the centreline we
   derive the left/right edges (for the asphalt + curbs) and use it for
   off-track detection and lap/progress tracking. */
const TRACK_HW = 78; // half-width of the asphalt
const CURB_W = 12; // curb strip width (outside the asphalt)

const WAYPOINTS: [number, number][] = [
  [420, 200],
  [920, 170],
  [1280, 330],
  [1320, 660],
  [1060, 840],
  [1180, 1080],
  [820, 1190],
  [440, 1090],
  [540, 800],
  [250, 660],
  [220, 380],
];

function cr(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 *
      (2 * p1[0] +
        (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

let center: Point[] = []; // [{x,y}]
const left: Point[] = []; // outer edge points
const right: Point[] = [];
const curbOutL: Point[] = [];
const curbOutR: Point[] = [];

function buildTrack(): void {
  const pts: Point[] = [];
  const n = WAYPOINTS.length;
  const perSeg = 20;
  for (let i = 0; i < n; i++) {
    const p0 = WAYPOINTS[(i - 1 + n) % n];
    const p1 = WAYPOINTS[i];
    const p2 = WAYPOINTS[(i + 1) % n];
    const p3 = WAYPOINTS[(i + 2) % n];
    for (let j = 0; j < perSeg; j++) {
      const c = cr(p0, p1, p2, p3, j / perSeg);
      pts.push({ x: c[0], y: c[1] });
    }
  }
  center = pts;
  const m = pts.length;
  for (let k = 0; k < m; k++) {
    const prev = pts[(k - 1 + m) % m];
    const next = pts[(k + 1) % m];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx; // left normal
    left.push({ x: pts[k].x + nx * TRACK_HW, y: pts[k].y + ny * TRACK_HW });
    right.push({ x: pts[k].x - nx * TRACK_HW, y: pts[k].y - ny * TRACK_HW });
    curbOutL.push({
      x: pts[k].x + nx * (TRACK_HW + CURB_W),
      y: pts[k].y + ny * (TRACK_HW + CURB_W),
    });
    curbOutR.push({
      x: pts[k].x - nx * (TRACK_HW + CURB_W),
      y: pts[k].y - ny * (TRACK_HW + CURB_W),
    });
  }
}

// Decorative grass patches scattered across the world (fixed positions
// so they read as motion as the camera moves).
const patches: Patch[] = [];
function buildPatches(): void {
  const rnd = mulberry(98765);
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  for (let i = 0; i < center.length; i++) {
    minX = Math.min(minX, center[i].x);
    maxX = Math.max(maxX, center[i].x);
    minY = Math.min(minY, center[i].y);
    maxY = Math.max(maxY, center[i].y);
  }
  const pad = 260;
  for (let c = 0; c < 220; c++) {
    const x = minX - pad + rnd() * (maxX - minX + pad * 2);
    const y = minY - pad + rnd() * (maxY - minY + pad * 2);
    // Skip patches that fall on the asphalt.
    if (distToTrack(x, y).dist < TRACK_HW + CURB_W + 10) continue;
    patches.push({ x: x, y: y, r: 7 + rnd() * 16, t: rnd() });
  }
}
function mulberry(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Nearest distance from a point to the centreline polyline, plus the
// index of the nearest segment (used for lap progress).
function distToTrack(px: number, py: number): { dist: number; idx: number } {
  let best = Infinity;
  let bestI = 0;
  const m = center.length;
  for (let i = 0; i < m; i++) {
    const a = center[i];
    const b = center[(i + 1) % m];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) {
      best = d;
      bestI = i;
    }
  }
  return { dist: best, idx: bestI };
}

/* ============================ Car ============================
   Heading convention: forward = (sin a, -cos a), so a = 0 points up.
   The camera is FIXED (world-up stays up); the car rotates on screen.

   The car carries a full velocity vector (vx, vy). Each step we split it
   into a forward and a lateral component relative to the heading: the
   engine pushes along forward, while lateral velocity is bled off by
   "grip". High grip snaps the car to where it points; low grip lets the
   tail slide — that is the drift. Holding the brake at speed acts as a
   handbrake that drops grip and lets you slide the car through corners. */
const ACCEL = 0.15;
const BRAKE = 0.22;
const MAX_SPEED = 6.0;
const OFF_MAX = 2.4;
const REVERSE_MAX = -2.0;
const DRAG = 0.992;
const ROLL = 0.975;
const OFF_DRAG = 0.9;
const STEER = 0.05;
const GRIP = 0.8; // lateral velocity retained per frame (grippy)
const DRIFT_GRIP = 0.95; // handbrake: tail slides for longer (drift)
const SLIP_MARK = 1.3; // |lateral speed| above which we lay rubber

const ZOOM = 0.82; // camera zoom-out so opponents stay in view

let car: Car;
let bots: Car[];
let input: Input;
let state: number;
let raceStartT: number;
let lapStartT: number;
let lap: number;
let lastLap: number;
let best: number;
const STATE_READY = 0;
const STATE_COUNT = 1;
const STATE_PLAY = 2;
let countUntil = 0;

// Bot personalities: body colours + how hard they push.
const BOT_DEFS: BotDef[] = [
  { c1: "#1e6fd9", c2: "#4aa0ff", c3: "#114a91", maxMul: 0.97, look: 9 },
  { c1: "#149a47", c2: "#46d97e", c3: "#0c6630", maxMul: 0.93, look: 10 },
  { c1: "#d9a514", c2: "#ffd24a", c3: "#916c0c", maxMul: 0.9, look: 8 },
];
const PLAYER_COL: CarColor = { c1: "#c81f2d", c2: "#ff3b4a", c3: "#9a121d" };

const store = MG.storage<{ best: number }>("top-racer", { version: 1 });
best = (store.load() || { best: 0 }).best || 0;
ui.setStat("best", best ? fmt(best) : "—");

// Pose on the start/finish line (centre[0]) with a lateral offset across
// the track, facing along the tangent (toward increasing index).
function gridPose(latOffset: number): Pose {
  const a = center[0];
  const b = center[1];
  let tx = b.x - a.x;
  let ty = b.y - a.y;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  const nx = -ty;
  const ny = tx; // left normal (across the track)
  return {
    x: a.x + nx * latOffset,
    y: a.y + ny * latOffset,
    angle: Math.atan2(tx, -ty),
  };
}

function newCarState(pose: Pose, extra?: CarExtra): Car {
  const c: Car = {
    x: pose.x,
    y: pose.y,
    angle: pose.angle,
    vx: 0,
    vy: 0,
    speed: 0,
    fwd: 0,
    lat: 0,
    onTrack: true,
    offIdx: 0,
    lap: 1,
    prevFrac: 0,
    passedHalf: false,
    prog: 1,
    skid: [],
  };
  if (extra)
    for (const k in extra)
      (c as unknown as Record<string, unknown>)[k] = (extra as Record<string, unknown>)[k];
  return c;
}

function resetRace(): void {
  // Side-by-side starting grid across the asphalt. The player takes a
  // centre slot; the three bots line up alongside.
  car = newCarState(gridPose(-15), { col: PLAYER_COL });
  bots = [];
  const lanes = [-48, 18, 48];
  for (let i = 0; i < BOT_DEFS.length; i++) {
    const d = BOT_DEFS[i];
    bots.push(
      newCarState(gridPose(lanes[i]), {
        col: { c1: d.c1, c2: d.c2, c3: d.c3 },
        maxSpeed: MAX_SPEED * d.maxMul,
        look: d.look,
        isBot: true,
      }),
    );
  }
  input = { left: false, right: false, gas: false, brake: false };
  lap = 1;
  lastLap = 0;
  state = STATE_READY;
  raceStartT = 0;
  lapStartT = 0;
  ui.setStat("pos", `1/${bots.length + 1}`);
  ui.setStat("lap", "1");
  ui.setStat("time", "0.00");
  flashEl.classList.add("hidden");
}

function showReady(): void {
  state = STATE_READY;
  overlay.classList.remove("hidden");
  renderOverlay();
}

function beginCountdown(): void {
  overlay.classList.add("hidden");
  state = STATE_COUNT;
  countUntil = now() + 3000;
}

function go(): void {
  state = STATE_PLAY;
  const t = now();
  raceStartT = t;
  lapStartT = t;
  flashEl.textContent = MG.i18n.t("go");
  flashEl.classList.remove("hidden");
  setTimeout(() => {
    if (state === STATE_PLAY) flashEl.classList.add("hidden");
  }, 650);
}

function now(): number {
  return performance.now();
}

function fmt(ms: number): string {
  if (!ms || ms < 0) return "0.00";
  const s = ms / 1000;
  if (s >= 60) {
    const mm = Math.floor(s / 60);
    const ss = s - mm * 60;
    return `${mm}:${ss < 10 ? "0" : ""}${ss.toFixed(2)}`;
  }
  return s.toFixed(2);
}

function renderOverlay(): void {
  const t = MG.i18n.t;
  overlayTitle.textContent = `🏎️ ${t("title")}`;
  if (lastLap > 0) {
    overlayHint.textContent = t("hint");
    (overlayScore as HTMLElement).hidden = false;
    let line = `${t("lastLabel")} <b>${fmt(lastLap)}</b>`;
    if (best > 0) line += `<br>${t("bestLabel")} <b>${fmt(best)}</b>`;
    overlayScore.innerHTML = line;
  } else {
    overlayHint.textContent = t("hint");
    (overlayScore as HTMLElement).hidden = true;
  }
  overlayAction.textContent = t("tapStart");
}
MG.i18n.onChange(() => {
  if (!overlay.classList.contains("hidden")) renderOverlay();
});

/* ============================ Physics ============================
   One step of arcade car physics for any car (player or bot), driven by
   an input record { left, right, gas, brake }. */
function stepCar(c: Car, inp: Input): void {
  const off = distToTrack(c.x, c.y);
  const onTrack = off.dist <= TRACK_HW;

  let sa = Math.sin(c.angle);
  let ca = Math.cos(c.angle);
  // Forward speed in the current heading (used to gate steering/handbrake).
  const fwd0 = c.vx * sa + c.vy * -ca;
  const vmag = Math.hypot(c.vx, c.vy);
  const handbrake = inp.brake && fwd0 > 1.5;

  // Steering rotates the heading first; scales with speed, flips in reverse.
  const dir = (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
  if (dir !== 0 && vmag > 0.04) {
    let auth = STEER * Math.min(1, vmag / 1.5) * (fwd0 < 0 ? -1 : 1);
    if (handbrake) auth *= 1.5; // sharper rotation while drifting
    c.angle += dir * auth;
  }

  // Re-split velocity into the (possibly rotated) heading frame.
  sa = Math.sin(c.angle);
  ca = Math.cos(c.angle);
  let fwd = c.vx * sa + c.vy * -ca;
  let lat = c.vx * ca + c.vy * sa;

  // Engine / brake along forward.
  if (inp.gas) fwd += ACCEL;
  if (inp.brake) {
    if (fwd > 0.15) fwd -= BRAKE;
    else fwd -= ACCEL * 0.6; // creep into reverse
  }

  // Longitudinal resistance + caps.
  fwd *= DRAG;
  if (!inp.gas && !inp.brake) fwd *= ROLL;
  if (!onTrack) fwd *= OFF_DRAG;
  const cap = onTrack ? c.maxSpeed || MAX_SPEED : OFF_MAX;
  if (fwd > cap) fwd = cap;
  if (fwd < REVERSE_MAX) fwd = REVERSE_MAX;

  // Lateral grip — this is the drift dial. Handbrake (and being off the
  // tarmac) lets the tail keep its sideways speed instead of biting.
  let grip = handbrake ? DRIFT_GRIP : GRIP;
  if (!onTrack) grip = Math.min(0.96, grip + 0.1);
  lat *= grip;

  if (Math.abs(fwd) < 0.02 && Math.abs(lat) < 0.02) {
    fwd = 0;
    lat = 0;
  }

  // Recompose the world velocity and integrate.
  c.vx = sa * fwd + ca * lat;
  c.vy = -ca * fwd + sa * lat;
  c.x += c.vx;
  c.y += c.vy;

  c.fwd = fwd;
  c.lat = lat;
  c.speed = fwd;
  c.onTrack = onTrack;
  c.offIdx = off.idx;

  // Lay rubber when the tyres are sliding (drift / hard braking).
  if (Math.abs(lat) > SLIP_MARK && vmag > 1.2) {
    const rear = 13;
    c.skid.push({
      x: c.x - Math.sin(c.angle) * rear,
      y: c.y + Math.cos(c.angle) * rear,
      a: c.angle,
    });
    if (c.skid.length > 140) c.skid.shift();
  }
}

// Wrap an angle into (-PI, PI].
function angNorm(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Bot AI: aim at a point further along the centreline, steer toward it,
// and ease off / brake into the sharper corners (which makes bots drift
// through them too, on the same physics as the player).
function botInput(b: Car): Input {
  const m = center.length;
  const target = center[(b.offIdx + (b.look || 9)) % m];
  const dx = target.x - b.x;
  const dy = target.y - b.y;
  const desired = Math.atan2(dx, -dy);
  const diff = angNorm(desired - b.angle);
  const inp: Input = { left: false, right: false, gas: false, brake: false };
  if (diff > 0.05) inp.right = true;
  else if (diff < -0.05) inp.left = true;
  const sharp = Math.abs(diff);
  if (sharp > 0.65 && b.fwd > 3.2)
    inp.brake = true; // scrub speed (drift)
  else inp.gas = true;
  return inp;
}

// Lap / position progress for any car: prog = laps + fraction of a lap.
function trackProgress(c: Car): boolean {
  const frac = c.offIdx / center.length;
  if (frac > 0.5) c.passedHalf = true;
  const crossed = c.passedHalf && c.prevFrac > 0.85 && frac < 0.15;
  c.prevFrac = frac;
  c.prog = c.lap + frac;
  return crossed;
}

// Keep cars from stacking: separate any overlapping pair.
function resolveCollisions(cars: Car[]): void {
  const R = 19;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < R * 2) {
        const nx = dx / d;
        const ny = dy / d;
        const push = (R * 2 - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        // Damp the closing velocity so hits feel like a nudge.
        a.vx -= nx * push * 0.4;
        a.vy -= ny * push * 0.4;
        b.vx += nx * push * 0.4;
        b.vy += ny * push * 0.4;
      }
    }
  }
}

/* ============================ Update ============================ */
function update(): void {
  if (state === STATE_COUNT) {
    const remain = countUntil - now();
    if (remain <= 0) {
      go();
    } else {
      flashEl.classList.remove("hidden");
      flashEl.textContent = String(Math.ceil(remain / 1000));
    }
    return;
  }
  if (state !== STATE_PLAY) return;

  // Step the player and every bot through the same physics.
  stepCar(car, input);
  for (let i = 0; i < bots.length; i++) stepCar(bots[i], botInput(bots[i]));

  resolveCollisions([car].concat(bots));

  // Lap / progress for everyone (player crossing the line is timed).
  if (trackProgress(car)) {
    completeLap();
  }
  for (let k = 0; k < bots.length; k++) {
    if (trackProgress(bots[k])) bots[k].lap++;
  }
  car.prog = car.lap + car.offIdx / center.length; // refresh after lap++

  // Standings — rank everyone by total progress around the track.
  let pos = 1;
  for (let p = 0; p < bots.length; p++) if (bots[p].prog > car.prog) pos++;
  ui.setStat("pos", `${pos}/${bots.length + 1}`);

  // HUD time.
  ui.setStat("time", fmt(now() - lapStartT));
}

function completeLap(): void {
  const t = now();
  lastLap = t - lapStartT;
  lapStartT = t;
  lap++;
  car.lap = lap; // keep the player's progress in sync with the HUD
  ui.setStat("lap", String(lap));
  if (best === 0 || lastLap < best) {
    best = lastLap;
    store.save({ best: best });
    ui.setStat("best", fmt(best));
    flashEl.textContent = MG.i18n.t("newBest");
    flashEl.style.fontSize = "clamp(1.4rem, 7vw, 2.6rem)";
    flashEl.classList.remove("hidden");
    setTimeout(() => {
      flashEl.classList.add("hidden");
      flashEl.style.fontSize = "";
    }, 1100);
  }
}

/* ============================ Render ============================ */
function draw(): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Grass background.
  ctx.fillStyle = "#3f8a3a";
  ctx.fillRect(0, 0, VW, VH);

  ctx.save();
  // Fixed camera: world-up stays up, we simply track the car (no rotation)
  // and zoom out a touch so the bots around you stay on screen.
  ctx.translate(VW / 2, VH / 2);
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-car.x, -car.y);

  drawPatches();
  drawTrack();
  drawSkid(car);
  for (let b = 0; b < bots.length; b++) drawSkid(bots[b]);
  drawStartLine();
  for (let i = 0; i < bots.length; i++) drawCar(bots[i]);
  drawCar(car);

  ctx.restore();

  drawSpeedo();
}

function drawPatches(): void {
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    ctx.fillStyle = p.t > 0.5 ? "rgba(40,110,40,0.55)" : "rgba(95,165,70,0.5)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function edgePath(outer: Point[], inner: Point[]): void {
  const m = center.length;
  ctx.beginPath();
  ctx.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < m; i++) ctx.lineTo(outer[i].x, outer[i].y);
  ctx.lineTo(outer[0].x, outer[0].y);
  for (let j = 0; j < m; j++) ctx.lineTo(inner[m - 1 - j].x, inner[m - 1 - j].y);
  ctx.closePath();
}

function drawTrack(): void {
  const m = center.length;

  // Curb base (red/white) drawn as a fat band, then asphalt on top.
  // Outer curb band: from curbOut to track edge.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Asphalt.
  ctx.fillStyle = "#43454c";
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < m; i++) ctx.lineTo(left[i].x, left[i].y);
  ctx.lineTo(left[0].x, left[0].y);
  for (let j = 0; j < m; j++) ctx.lineTo(right[m - 1 - j].x, right[m - 1 - j].y);
  ctx.closePath();
  ctx.fill();

  // Curbs — alternating red/white quads along each edge.
  for (let k = 0; k < m; k++) {
    const k2 = (k + 1) % m;
    const col = k % 2 === 0 ? "#e8443a" : "#f4f4f4";
    // Left curb.
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(left[k].x, left[k].y);
    ctx.lineTo(left[k2].x, left[k2].y);
    ctx.lineTo(curbOutL[k2].x, curbOutL[k2].y);
    ctx.lineTo(curbOutL[k].x, curbOutL[k].y);
    ctx.closePath();
    ctx.fill();
    // Right curb.
    ctx.beginPath();
    ctx.moveTo(right[k].x, right[k].y);
    ctx.lineTo(right[k2].x, right[k2].y);
    ctx.lineTo(curbOutR[k2].x, curbOutR[k2].y);
    ctx.lineTo(curbOutR[k].x, curbOutR[k].y);
    ctx.closePath();
    ctx.fill();
  }

  // Dashed centre line.
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 4;
  ctx.setLineDash([20, 24]);
  ctx.beginPath();
  ctx.moveTo(center[0].x, center[0].y);
  for (let c = 1; c < m; c++) ctx.lineTo(center[c].x, center[c].y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawStartLine(): void {
  // Checkered band across the track at centre[0].
  const a = center[0];
  const b = center[1];
  let tx = b.x - a.x;
  let ty = b.y - a.y;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  const nx = -ty;
  const ny = tx; // across the track
  const cols = 10;
  const depth = 26;
  const step = (TRACK_HW * 2) / cols;
  ctx.save();
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < cols; i++) {
      const on = (i + row) % 2 === 0;
      ctx.fillStyle = on ? "#f4f4f4" : "#222";
      const ox = a.x + nx * (-TRACK_HW + i * step) + tx * (row * depth);
      const oy = a.y + ny * (-TRACK_HW + i * step) + ty * (row * depth);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + nx * step, oy + ny * step);
      ctx.lineTo(ox + nx * step + tx * depth, oy + ny * step + ty * depth);
      ctx.lineTo(ox + tx * depth, oy + ty * depth);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSkid(c: Car): void {
  const marks = c.skid;
  ctx.fillStyle = "rgba(20,20,24,0.35)";
  for (let i = 0; i < marks.length; i++) {
    const s = marks[i];
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a);
    ctx.fillRect(-5, -3, 3, 6);
    ctx.fillRect(2, -3, 3, 6);
    ctx.restore();
  }
}

function drawCar(c: Car): void {
  const col = c.col || PLAYER_COL;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);

  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  roundRect(-12, -16, 24, 36, 6);
  ctx.fill();

  // Body.
  const grad = ctx.createLinearGradient(-13, 0, 13, 0);
  grad.addColorStop(0, col.c1);
  grad.addColorStop(0.5, col.c2);
  grad.addColorStop(1, col.c1);
  ctx.fillStyle = grad;
  roundRect(-13, -19, 26, 38, 7);
  ctx.fill();

  // Wings.
  ctx.fillStyle = col.c3;
  ctx.fillRect(-16, -12, 4, 9);
  ctx.fillRect(12, -12, 4, 9);
  ctx.fillRect(-17, 9, 5, 8);
  ctx.fillRect(12, 9, 5, 8);

  // Cockpit / windshield.
  ctx.fillStyle = "#1a2330";
  roundRect(-8, -8, 16, 14, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(140,200,255,0.5)";
  roundRect(-7, -7, 14, 6, 3);
  ctx.fill();

  // Nose stripe.
  ctx.fillStyle = "#fff";
  ctx.fillRect(-3, -19, 6, 7);

  ctx.restore();
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

function drawSpeedo(): void {
  const kmh = Math.round(Math.abs(car.speed) * 38);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  const bw = 96;
  const bh = 40;
  const bx = VW / 2 - bw / 2;
  const by = 12;
  ctx.beginPath();
  ctx.moveTo(bx + 12, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bh, 12);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, 12);
  ctx.arcTo(bx, by + bh, bx, by, 12);
  ctx.arcTo(bx, by, bx + bw, by, 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 22px 'Trebuchet MS', sans-serif";
  ctx.fillText(String(kmh), VW / 2, by + 16);
  ctx.font = "600 10px 'Trebuchet MS', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("km/h", VW / 2, by + 31);
}

/* ============================ Loop ============================ */
function loop(): void {
  update();
  draw();
  requestAnimationFrame(loop);
}

/* ============================ Input ============================ */
// Overlay tap → start the countdown.
function onOverlayTap(e: Event): void {
  e.preventDefault();
  if (state === STATE_READY) beginCountdown();
}
overlay.addEventListener("mousedown", onOverlayTap);
overlay.addEventListener("touchstart", onOverlayTap, { passive: false });

// Keyboard.
const keyMap: Record<string, keyof Input> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "gas",
  KeyW: "gas",
  ArrowDown: "brake",
  KeyS: "brake",
};
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.code === "Space" || e.code === "Enter") {
    if (state === STATE_READY) {
      e.preventDefault();
      beginCountdown();
      return;
    }
  }
  const k = keyMap[e.code];
  if (k) {
    input[k] = true;
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e: KeyboardEvent) => {
  const k = keyMap[e.code];
  if (k) {
    input[k] = false;
    e.preventDefault();
  }
});

// On-screen buttons — multi-touch friendly via pointer events.
const buttons = document.querySelectorAll<HTMLButtonElement>(".ctl");
Array.prototype.forEach.call(buttons, (btn: HTMLButtonElement) => {
  const k = btn.getAttribute("data-k") as keyof Input;
  function press(e: Event): void {
    e.preventDefault();
    input[k] = true;
    btn.classList.add("held");
    if (state === STATE_READY) beginCountdown();
  }
  function release(e?: Event): void {
    if (e) e.preventDefault();
    input[k] = false;
    btn.classList.remove("held");
  }
  btn.addEventListener("pointerdown", press);
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointerleave", release);
  // Avoid the synthetic mouse/scroll behaviours on touch.
  btn.addEventListener("contextmenu", (e: Event) => {
    e.preventDefault();
  });
});

// Releasing the pointer anywhere clears any stuck buttons.
window.addEventListener("pointerup", () => {
  if (state !== STATE_PLAY && state !== STATE_COUNT) return;
});

window.addEventListener("resize", resize);
window.addEventListener("blur", () => {
  input.left = input.right = input.gas = input.brake = false;
  Array.prototype.forEach.call(buttons, (b: HTMLButtonElement) => {
    b.classList.remove("held");
  });
});

/* ============================ Boot ============================ */
buildTrack();
buildPatches();
resize();
resetRace();
showReady();
loop();

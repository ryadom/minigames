import { MG } from "../../../shared/mg";
import type { HeaderUI, SaveStore } from "../../../shared/types";

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/* ============================ i18n ============================ */
// Translations live in the shared registry; the header + footer below
// re-render automatically whenever the language changes.
MG.i18n.register({
  en: {
    title: "MINESWEEPER",
    errors: "Errors",
    opened: "Opened",
    flags: "Flags",
    position: "Position",
    seed: "Seed",
    center: "⌖ Center",
    new: "↻ New",
    hints: [
      "LMB — open",
      "double click / tap — clear neighbors · auto-flag",
      "RMB / long press — flag",
      "drag — pan",
      "pinch / wheel — zoom",
      "grid 16×16 — chunk guides",
    ],
  },
  ru: {
    title: "САПЁР",
    errors: "Ошибки",
    opened: "Открыто",
    flags: "Флаги",
    position: "Позиция",
    seed: "Seed",
    center: "⌖ В центр",
    new: "↻ Новая",
    hints: [
      "ЛКМ — открыть",
      "2× клик / тап — раскрыть соседей · авто-флаг",
      "ПКМ / долгий тап — флаг",
      "тащить — двигать",
      "щипок / колесо — зум",
      "сетка 16×16 — разметка чанков",
    ],
  },
  es: {
    title: "BUSCAMINAS",
    errors: "Errores",
    opened: "Abiertas",
    flags: "Banderas",
    position: "Posición",
    seed: "Semilla",
    center: "⌖ Centrar",
    new: "↻ Nueva",
    hints: [
      "Clic izq. — abrir",
      "doble clic / toque — abrir vecinas · auto-bandera",
      "Clic der. / mantener — bandera",
      "arrastrar — mover",
      "pellizcar / rueda — zoom",
      "rejilla 16×16 — guías de chunk",
    ],
  },
});

// Mount the shared header: brand (∞ + title), live stats, language
// selector and the Center / New buttons.
const ui: HeaderUI = MG.mountHeader({
  icon: "∞",
  titleKey: "title",
  stats: [
    { key: "err", labelKey: "errors", variant: "alert" },
    { key: "rev", labelKey: "opened" },
    { key: "flag", labelKey: "flags" },
    { key: "pos", labelKey: "position", variant: "sm", value: "0, 0" },
    { key: "seed", labelKey: "seed", variant: "sm", value: "0" },
  ],
  actions: [
    {
      key: "center",
      labelKey: "center",
      onClick: () => {
        center();
      },
    },
    {
      key: "new",
      labelKey: "new",
      onClick: () => {
        newGame();
      },
    },
  ],
});

// Footer hints (an array translation) — rebuilt on every language change.
function renderHints(): void {
  const hints = MG.i18n.t<string[]>("hints");
  let html = "";
  hints.forEach((h: string, i: number) => {
    const hide = i >= 4 ? " hide" : "";
    if (i > 0) html += `<span class="sep${hide}">·</span>`;
    html += `<span class="seg${hide}">${h}</span>`;
  });
  $("hints").innerHTML = html;
}
MG.i18n.onChange(renderHints);
renderHints();

/* ============================ game ============================ */
const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const wrap = $("wrap");
const TILE = 16;
const MINE_DENSITY = 0.16;
const NUM_COLORS: (string | null)[] = [
  null,
  "#4aa3ff",
  "#46c46a",
  "#ff5d5d",
  "#b888ff",
  "#ff9d3d",
  "#2fd9c5",
  "#e6e6e6",
  "#9aa6b0",
];

let seed = (Math.random() * 1e9) | 0;
let cellSize = 30;
let offsetX = 0;
let offsetY = 0;
let dpr = 1;
let W = 0;
let H = 0;
let errors = 0;
let firstMove = true;

const revealed = new Set<string>();
const flagged = new Set<string>();
const hitMines = new Set<string>();
const safe = new Set<string>();
const k = (x: number, y: number): string => `${x},${y}`;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

// Deterministic generation; cells in `safe` are forced mine-free (safe first move).
function rand(x: number, y: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function isMine(x: number, y: number): boolean {
  return !safe.has(k(x, y)) && rand(x, y) < MINE_DENSITY;
}

function adj(x: number, y: number): number {
  let c = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (isMine(x + dx, y + dy)) c++;
    }
  }
  return c;
}

// The first click of a new game is guaranteed to land on a "0" cell,
// which opens up the surrounding area.
function reveal(x: number, y: number): void {
  const key = k(x, y);
  if (revealed.has(key) || flagged.has(key)) return;

  if (firstMove) {
    firstMove = false;
    for (let sx = -1; sx <= 1; sx++) {
      for (let sy = -1; sy <= 1; sy++) safe.add(k(x + sx, y + sy));
    }
  }

  // Clicking a mine directly counts as an error; the game does not end.
  if (isMine(x, y)) {
    revealed.add(key);
    hitMines.add(key);
    errors++;
    flashErr();
    updateHud();
    draw();
    scheduleSave();
    return;
  }

  // Flood fill freely spills into neighbouring chunks.
  const stack: [number, number][] = [[x, y]];
  let guard = 0;
  while (stack.length) {
    const cell = stack.pop() as [number, number];
    const cx = cell[0];
    const cy = cell[1];
    const ck = k(cx, cy);
    if (revealed.has(ck) || flagged.has(ck) || isMine(cx, cy)) continue;
    revealed.add(ck);
    if (adj(cx, cy) === 0 && guard++ < 200000) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          stack.push([cx + dx, cy + dy]);
        }
      }
    }
  }
  updateHud();
  draw();
  scheduleSave();
}

function toggleFlag(x: number, y: number): void {
  const key = k(x, y);
  if (revealed.has(key)) return;
  if (flagged.has(key)) flagged.delete(key);
  else flagged.add(key);
  updateHud();
  draw();
  scheduleSave();
}

// Double click: reveal neighbours (when the mine count is satisfied) or
// auto-flag (when every closed neighbour must be a mine).
function chord(x: number, y: number): void {
  const key = k(x, y);
  if (!revealed.has(key) || hitMines.has(key)) return;
  const n = adj(x, y);
  let known = 0;
  const closed: [number, number][] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      const nk = k(nx, ny);
      if (flagged.has(nk)) known++;
      else if (hitMines.has(nk)) known++;
      else if (!revealed.has(nk)) closed.push([nx, ny]);
    }
  }
  const remaining = n - known;
  if (remaining > 0 && remaining === closed.length) {
    for (let i = 0; i < closed.length; i++) flagged.add(k(closed[i][0], closed[i][1]));
    updateHud();
    draw();
    scheduleSave();
    return;
  }
  if (known === n) {
    for (let j = 0; j < closed.length; j++) reveal(closed[j][0], closed[j][1]);
  }
}

/* ===================== save (versioned, shared store) ===================== */
// Persisted through MG.storage (shared/mg.js) so the whole site shares one
// save mechanism. The envelope carries the version, so the payload below is
// just the board state; bump the version + add a migration to evolve it.
interface SaveData {
  seed: number;
  errors: number;
  cellSize: number;
  offsetX: number;
  offsetY: number;
  firstMove: boolean;
  revealed: string[];
  flagged: string[];
  hitMines: string[];
  safe: string[];
}

const store: SaveStore<SaveData> = MG.storage<SaveData>("minesweeper", { version: 2 });
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}

function saveState(): void {
  store.save({
    seed: seed,
    errors: errors,
    cellSize: cellSize,
    offsetX: offsetX,
    offsetY: offsetY,
    firstMove: firstMove,
    revealed: Array.from(revealed),
    flagged: Array.from(flagged),
    hitMines: Array.from(hitMines),
    safe: Array.from(safe),
  });
}

function loadState(): boolean {
  const st = store.load();
  try {
    if (!st) return false;
    seed = st.seed;
    errors = st.errors || 0;
    cellSize = st.cellSize || 30;
    offsetX = st.offsetX;
    offsetY = st.offsetY;
    firstMove = !!st.firstMove;
    revealed.clear();
    (st.revealed || []).forEach((x: string) => {
      revealed.add(x);
    });
    flagged.clear();
    (st.flagged || []).forEach((x: string) => {
      flagged.add(x);
    });
    hitMines.clear();
    (st.hitMines || []).forEach((x: string) => {
      hitMines.add(x);
    });
    safe.clear();
    (st.safe || []).forEach((x: string) => {
      safe.add(x);
    });
    return true;
  } catch (_e) {
    return false;
  }
}

/* ============================ rendering ============================ */
function resize(): void {
  dpr = window.devicePixelRatio || 1;
  W = wrap.clientWidth;
  H = wrap.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw(): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0c0f";
  ctx.fillRect(0, 0, W, H);

  const c0 = Math.floor(-offsetX / cellSize);
  const r0 = Math.floor(-offsetY / cellSize);
  const cols = Math.ceil(W / cellSize) + 1;
  const rows = Math.ceil(H / cellSize) + 1;
  const s = cellSize;
  const showText = s >= 14;
  const fontPx = Math.floor(s * 0.58);
  if (showText) {
    ctx.font = `600 ${fontPx}px "IBM Plex Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = c0 + i;
      const cy = r0 + j;
      const px = offsetX + cx * s;
      const py = offsetY + cy * s;
      const key = k(cx, cy);
      const checker = (cx ^ cy) & 1;
      if (revealed.has(key)) {
        if (hitMines.has(key)) {
          ctx.fillStyle = "#3a1418";
          ctx.fillRect(px, py, s, s);
          ctx.fillStyle = "#ff4757";
          ctx.beginPath();
          ctx.arc(px + s / 2, py + s / 2, s * 0.24, 0, 7);
          ctx.fill();
        } else {
          ctx.fillStyle = checker ? "#0e1318" : "#10151b";
          ctx.fillRect(px, py, s, s);
          if (showText) {
            const n = adj(cx, cy);
            if (n > 0) {
              ctx.fillStyle = NUM_COLORS[n] as string;
              ctx.fillText(String(n), px + s / 2, py + s / 2 + 1);
            }
          }
        }
      } else {
        ctx.fillStyle = checker ? "#1b212a" : "#1f2630";
        ctx.fillRect(px, py, s, s);
        if (flagged.has(key) && showText) {
          ctx.fillStyle = "#ffb43d";
          ctx.fillRect(px + s * 0.46, py + s * 0.24, Math.max(1.5, s * 0.05), s * 0.5);
          ctx.beginPath();
          ctx.moveTo(px + s * 0.46, py + s * 0.24);
          ctx.lineTo(px + s * 0.74, py + s * 0.34);
          ctx.lineTo(px + s * 0.46, py + s * 0.44);
          ctx.closePath();
          ctx.fillStyle = "#ff5d5d";
          ctx.fill();
        }
      }
      if (s >= 10) {
        ctx.strokeStyle = "rgba(255,255,255,0.035)";
        ctx.strokeRect(px + 0.5, py + 0.5, s, s);
      }
    }
  }

  // Chunk guides every TILE cells.
  ctx.strokeStyle = "rgba(0,230,200,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gi = 0; gi <= cols; gi++) {
    const gcx = c0 + gi;
    if (((gcx % TILE) + TILE) % TILE === 0) {
      const gpx = Math.round(offsetX + gcx * s) + 0.5;
      ctx.moveTo(gpx, 0);
      ctx.lineTo(gpx, H);
    }
  }
  for (let gj = 0; gj <= rows; gj++) {
    const gcy = r0 + gj;
    if (((gcy % TILE) + TILE) % TILE === 0) {
      const gpy = Math.round(offsetY + gcy * s) + 0.5;
      ctx.moveTo(0, gpy);
      ctx.lineTo(W, gpy);
    }
  }
  ctx.stroke();

  // Highlight the origin cell when it's on screen.
  const ox = offsetX;
  const oy = offsetY;
  if (ox > -s && ox < W + s && oy > -s && oy < H + s) {
    ctx.strokeStyle = "rgba(255,180,61,0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 1, oy + 1, s - 2, s - 2);
  }
}

/* ============================ HUD ============================ */
function updateHud(): void {
  ui.setStat("err", errors);
  ui.setStat("rev", revealed.size - hitMines.size);
  ui.setStat("flag", flagged.size);
  ui.setStat("seed", (seed >>> 0).toString(36));
  const cx = Math.floor((W / 2 - offsetX) / cellSize);
  const cy = Math.floor((H / 2 - offsetY) / cellSize);
  ui.setStat("pos", `${cx}, ${cy}`);
}

function flashErr(): void {
  const e = ui.stat("err");
  if (!e) return;
  e.classList.remove("mg-flash");
  void e.offsetWidth;
  e.classList.add("mg-flash");
}

/* ============================ input ============================ */
let down = false;
let moved = false;
let sx = 0;
let sy = 0;
let lx = 0;
let ly = 0;
let btn = 0;
let lpTimer: ReturnType<typeof setTimeout> | null = null;
let lastTap = 0;
let lastTapKey = "";
const DRAG = 5;

// Multi-touch pinch-to-zoom. We track every active pointer; once two are down
// we leave pan/tap behind and scale the board around the gesture's midpoint
// (the touch equivalent of the wheel handler below).
const pointers = new Map<number, { x: number; y: number }>();
let pinching = false;
let pinchStartDist = 0;
let pinchStartSize = 0;
let pinchWX = 0;
let pinchWY = 0;

function startPinch(): void {
  pinching = true;
  if (lpTimer !== null) clearTimeout(lpTimer);
  down = false; // abandon any pan / pending tap in favour of the zoom
  const pts = Array.from(pointers.values());
  const r = canvas.getBoundingClientRect();
  pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
  pinchStartSize = cellSize;
  const mx = (pts[0].x + pts[1].x) / 2 - r.left;
  const my = (pts[0].y + pts[1].y) / 2 - r.top;
  pinchWX = (mx - offsetX) / cellSize;
  pinchWY = (my - offsetY) / cellSize;
}

function movePinch(): void {
  const pts = Array.from(pointers.values());
  const r = canvas.getBoundingClientRect();
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
  const mx = (pts[0].x + pts[1].x) / 2 - r.left;
  const my = (pts[0].y + pts[1].y) / 2 - r.top;
  cellSize = clamp(pinchStartSize * (dist / pinchStartDist), 7, 70);
  offsetX = mx - pinchWX * cellSize;
  offsetY = my - pinchWY * cellSize;
  draw();
  updateHud();
}

function cellAt(cxp: number, cyp: number): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [
    Math.floor((cxp - r.left - offsetX) / cellSize),
    Math.floor((cyp - r.top - offsetY) / cellSize),
  ];
}

canvas.addEventListener("pointerdown", (e: PointerEvent) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    startPinch();
    return;
  }
  down = true;
  moved = false;
  btn = e.button;
  sx = lx = e.clientX;
  sy = ly = e.clientY;
  if (e.pointerType === "touch") {
    lpTimer = setTimeout(() => {
      if (down && !moved) {
        const c = cellAt(sx, sy);
        toggleFlag(c[0], c[1]);
        moved = true;
      }
    }, 420);
  }
});

canvas.addEventListener("pointermove", (e: PointerEvent) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinching) {
    movePinch();
    return;
  }
  if (!down) return;
  const dx = e.clientX - lx;
  const dy = e.clientY - ly;
  if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > DRAG) {
    moved = true;
    if (lpTimer !== null) clearTimeout(lpTimer);
  }
  if (moved) {
    offsetX += dx;
    offsetY += dy;
    lx = e.clientX;
    ly = e.clientY;
    draw();
    updateHud();
  }
});

canvas.addEventListener("pointerup", (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pinching) {
    if (pointers.size < 2) {
      pinching = false;
      scheduleSave();
    }
    down = false;
    return;
  }
  if (lpTimer !== null) clearTimeout(lpTimer);
  if (down && !moved) {
    const c = cellAt(e.clientX, e.clientY);
    const x = c[0];
    const y = c[1];
    if (btn === 2) {
      toggleFlag(x, y);
    } else {
      const now = performance.now();
      const tk = k(x, y);
      if (now - lastTap < 320 && tk === lastTapKey && revealed.has(tk)) {
        chord(x, y);
        lastTap = 0;
        lastTapKey = "";
      } else {
        reveal(x, y);
        lastTap = now;
        lastTapKey = tk;
      }
    }
  } else if (moved) {
    scheduleSave();
  }
  down = false;
});

canvas.addEventListener("pointercancel", (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pinching && pointers.size < 2) pinching = false;
  if (lpTimer !== null) clearTimeout(lpTimer);
  down = false;
});

canvas.addEventListener("contextmenu", (e: MouseEvent) => {
  e.preventDefault();
});

canvas.addEventListener(
  "wheel",
  (e: WheelEvent) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const wx = (mx - offsetX) / cellSize;
    const wy = (my - offsetY) / cellSize;
    cellSize = clamp(cellSize * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 7, 70);
    offsetX = mx - wx * cellSize;
    offsetY = my - wy * cellSize;
    draw();
    updateHud();
    scheduleSave();
  },
  { passive: false },
);

/* ============================ controls ============================ */
function center(): void {
  offsetX = W / 2 - cellSize / 2;
  offsetY = H / 2 - cellSize / 2;
  draw();
  updateHud();
  scheduleSave();
}

function newGame(): void {
  seed = (Math.random() * 1e9) | 0;
  revealed.clear();
  flagged.clear();
  hitMines.clear();
  safe.clear();
  errors = 0;
  firstMove = true;
  cellSize = 30;
  center();
  saveState();
}

/* ============================ start ============================ */
window.addEventListener("resize", resize);
window.addEventListener("pagehide", saveState);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveState();
});

const restored = loadState();
resize();
if (restored) {
  draw();
  updateHud();
} else {
  center();
}

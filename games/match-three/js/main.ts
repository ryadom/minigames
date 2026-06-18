import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "Match Three",
    score: "Score",
    best: "Best",
    level: "Level",
    goal: "Goal",
    hint: "Swap two neighbouring gems to line up 3 or more of a colour. Match bigger to forge power-ups!",
    play: "▶ Play",
    levelUp: "Level {n}!",
    legRocket: "Match 4 → Rocket: clears a whole line",
    legBomb: "Match in an L / T → Bomb: blasts 3×3",
    legRainbow: "Match 5 → Rainbow: clears one colour",
    legCombo: "Swap two power-ups for a huge combo!",
    shuffle: "No moves — shuffling…",
  },
  ru: {
    title: "Три в ряд",
    score: "Очки",
    best: "Рекорд",
    level: "Уровень",
    goal: "Цель",
    hint: "Меняй местами соседние камни, чтобы собрать 3+ одного цвета. Большие комбо дают бонусы!",
    play: "▶ Играть",
    levelUp: "Уровень {n}!",
    legRocket: "Ряд из 4 → Ракета: чистит линию",
    legBomb: "Сбор в форме Г / Т → Бомба: взрыв 3×3",
    legRainbow: "Ряд из 5 → Радуга: убирает один цвет",
    legCombo: "Поменяй два бонуса местами — мощное комбо!",
    shuffle: "Нет ходов — перемешиваем…",
  },
  es: {
    title: "Tres en línea",
    score: "Puntos",
    best: "Mejor",
    level: "Nivel",
    goal: "Meta",
    hint: "Intercambia gemas vecinas para alinear 3 o más del mismo color. ¡Combos grandes dan poderes!",
    play: "▶ Jugar",
    levelUp: "¡Nivel {n}!",
    legRocket: "4 en línea → Cohete: limpia una línea",
    legBomb: "Forma de L / T → Bomba: estalla 3×3",
    legRainbow: "5 en línea → Arcoíris: limpia un color",
    legCombo: "¡Junta dos poderes para un súper combo!",
    shuffle: "Sin jugadas — barajando…",
  },
});

const t = MG.i18n.t;

const canvas = $("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const overlay = $("overlay");
const overlayTitle = $("overlay-title");
const overlayHint = $("overlay-hint");
const overlayLegend = $("overlay-legend");
const overlayScore = $("overlay-score");
const overlayAction = $("overlay-action");
const toastEl = $("toast");

const ui: HeaderUI = MG.mountHeader({
  icon: "💎",
  titleKey: "title",
  stats: [
    { key: "score", labelKey: "score", value: "0" },
    { key: "goal", labelKey: "goal", variant: "sm", value: "0" },
    { key: "level", labelKey: "level", value: "1" },
    { key: "best", labelKey: "best", value: "0" },
  ],
});

/* ============================ Types ============================ */
type GemShape = "circle" | "square" | "diamond" | "triangle" | "pentagon" | "hex";
type TileType = "normal" | "rocketH" | "rocketV" | "bomb" | "rainbow";
type Phase = "idle" | "swap" | "swapback" | "clearing" | "falling" | "resolving";

interface Gem {
  base: string;
  light: string;
  dark: string;
  shape: GemShape;
}

interface Tile {
  color: number;
  type: TileType;
  x: number;
  y: number;
  tx: number;
  ty: number;
  scale: number;
  clearing: boolean;
}

interface Cell {
  r: number;
  c: number;
}

type CellMap = Record<string, Cell>;

interface Special {
  r: number;
  c: number;
  type: TileType;
  color: number;
}

interface HRun {
  r: number;
  c0: number;
  c1: number;
  len: number;
  color: number;
}

interface VRun {
  c: number;
  r0: number;
  r1: number;
  len: number;
  color: number;
}

interface Runs {
  H: HRun[];
  V: VRun[];
}

interface MatchResult {
  cells: CellMap;
  specials: Special[];
}

interface Geom {
  x: number;
  y: number;
  size: number;
}

interface Swap {
  a: Cell;
  b: Cell;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
}

interface Press {
  cell: Cell;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

/* ============================ Constants ============================ */
const N = 8; // board is N x N
const NCOLORS = 6;
const LERP = 0.3; // tween factor toward target
const SETTLE = 0.6; // px threshold for "settled"
const CLEAR_FRAMES = 13; // duration of a clear animation

// Gem palette: { base, light, dark, shape }
const GEMS: Gem[] = [
  { base: "#ff4d6d", light: "#ff9bb0", dark: "#b81f3e", shape: "circle" },
  { base: "#4d9bff", light: "#a5cbff", dark: "#1f5bb8", shape: "square" },
  { base: "#4ddd7a", light: "#a8f0c0", dark: "#1f9e49", shape: "diamond" },
  { base: "#ffd23d", light: "#ffe98c", dark: "#c79100", shape: "triangle" },
  { base: "#c46dff", light: "#e0b3ff", dark: "#8a2fd1", shape: "pentagon" },
  { base: "#ff9a3d", light: "#ffc78c", dark: "#c76600", shape: "hex" },
];

/* ============================ State ============================ */
let board: (Tile | null)[][]; // board[r][c] = tile | null
const geom: Geom = { x: 0, y: 0, size: 40 };
let W = 0;
let H = 0;
let dpr = 1;

const STATE_READY = 0;
const STATE_PLAY = 1;
let state: number = STATE_READY;

// The board accepts a new swap while idle and also mid-fall, so a clear's
// drop animation never blocks the next move.
function canInteract(): boolean {
  return state === STATE_PLAY && (phase === "idle" || phase === "falling");
}

// animation phases while a move resolves
let phase: Phase = "idle"; // idle | swap | swapback | clearing | falling | resolving
let phaseT = 0;
let clearList: Cell[] = []; // cells currently shrinking
let cascade = 0; // multiplier for chained clears
let lastSwap: Swap | null = null; // { a:{r,c}, b:{r,c} } — for special placement

let score: number;
let level: number;
let goal: number;
let best: number;
let floaters: Floater[] = []; // floating score popups
let selected: Cell | null = null; // currently selected cell
let press: Press | null = null; // pointer-down cell for drag detection

const store = MG.storage<{ best: number }>("match-three", { version: 1 });
best = (store.load() || { best: 0 }).best;
ui.setStat("best", best);

/* ============================ Tiles ============================ */
function makeTile(color: number, type?: TileType): Tile {
  return {
    color: color,
    type: type || "normal",
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    scale: 1,
    clearing: false,
  };
}

function cellX(c: number): number {
  return geom.x + c * geom.size + geom.size / 2;
}
function cellY(r: number): number {
  return geom.y + r * geom.size + geom.size / 2;
}

/* ============================ Geometry ============================ */
function resize(): void {
  const rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  const pad = 14;
  let boardPx = Math.min(W, H) - pad * 2;
  boardPx = Math.max(boardPx, N * 8);
  geom.size = boardPx / N;
  geom.x = (W - boardPx) / 2;
  geom.y = (H - boardPx) / 2;

  // Snap every tile to its logical home.
  if (board) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const tile = board[r][c];
        if (!tile) continue;
        tile.tx = cellX(c);
        tile.ty = cellY(r);
        tile.x = tile.tx;
        tile.y = tile.ty;
      }
    }
  }
}

/* ============================ Board setup ============================ */
function newGame(): void {
  score = 0;
  level = 1;
  goal = goalFor(level);
  cascade = 0;
  phase = "idle";
  selected = null;
  floaters = [];
  buildBoard();
  if (!anyMove()) shuffleBoard(true);
  syncStats();
}

function goalFor(lv: number): number {
  return 800 + (lv - 1) * 700 + (lv - 1) * (lv - 1) * 120;
}

function buildBoard(): void {
  board = [];
  for (let r = 0; r < N; r++) {
    board[r] = [];
    for (let c = 0; c < N; c++) {
      let color: number;
      let guard = 0;
      do {
        color = (Math.random() * NCOLORS) | 0;
        guard++;
      } while (
        guard < 30 &&
        ((c >= 2 &&
          board[r][c - 1] &&
          board[r][c - 2] &&
          board[r][c - 1]!.color === color &&
          board[r][c - 2]!.color === color) ||
          (r >= 2 &&
            board[r - 1][c] &&
            board[r - 2][c] &&
            board[r - 1][c]!.color === color &&
            board[r - 2][c]!.color === color))
      );
      const tile = makeTile(color, "normal");
      tile.tx = tile.x = cellX(c);
      tile.ty = tile.y = cellY(r);
      board[r][c] = tile;
    }
  }
}

function eachCell(fn: (r: number, c: number, tile: Tile | null) => void): void {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) fn(r, c, board[r][c]);
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < N && c >= 0 && c < N;
}

/* ============================ Match finding ============================ */
// Returns horizontal & vertical runs of >=3 same-colour normal tiles.
function findRuns(): Runs {
  const Hr: HRun[] = [];
  const Vr: VRun[] = [];
  let r: number;
  let c: number;
  for (r = 0; r < N; r++) {
    c = 0;
    while (c < N) {
      const th = board[r][c];
      if (th && th.type === "normal") {
        let c2 = c + 1;
        while (c2 < N) {
          const u = board[r][c2];
          if (u && u.type === "normal" && u.color === th.color) c2++;
          else break;
        }
        if (c2 - c >= 3) Hr.push({ r: r, c0: c, c1: c2 - 1, len: c2 - c, color: th.color });
        c = c2;
      } else c++;
    }
  }
  for (c = 0; c < N; c++) {
    r = 0;
    while (r < N) {
      const tv = board[r][c];
      if (tv && tv.type === "normal") {
        let r2 = r + 1;
        while (r2 < N) {
          const v = board[r2][c];
          if (v && v.type === "normal" && v.color === tv.color) r2++;
          else break;
        }
        if (r2 - r >= 3) Vr.push({ c: c, r0: r, r1: r2 - 1, len: r2 - r, color: tv.color });
        r = r2;
      } else r++;
    }
  }
  return { H: Hr, V: Vr };
}

// Compute the result of resolving all current matches:
//   { cells: {key:{r,c}}, specials: [{r,c,type,color}] }
function computeMatches(): MatchResult {
  const runs = findRuns();
  const cells: CellMap = {};
  const specials: Special[] = [];
  if (!runs.H.length && !runs.V.length) return { cells: cells, specials: specials };

  const inH = grid(false);
  const inV = grid(false);
  let c: number;
  let r: number;
  let key: string;

  runs.H.forEach((run) => {
    for (c = run.c0; c <= run.c1; c++) {
      inH[run.r][c] = true;
      mark(cells, run.r, c);
    }
  });
  runs.V.forEach((run) => {
    for (r = run.r0; r <= run.r1; r++) {
      inV[r][run.c] = true;
      mark(cells, r, run.c);
    }
  });

  const specialMap: Record<string, Special> = {};

  // Intersections (L / T / +) become a bomb.
  for (key in cells) {
    if (!Object.hasOwn(cells, key)) continue;
    const p = cells[key];
    if (inH[p.r][p.c] && inV[p.r][p.c]) {
      specialMap[key] = { r: p.r, c: p.c, type: "bomb", color: board[p.r][p.c]!.color };
    }
  }

  // Long straight runs become rockets (4) or rainbows (5+).
  function placeFromRun(run: HRun | VRun, isH: boolean): void {
    const type: TileType | null =
      run.len >= 5 ? "rainbow" : run.len === 4 ? (isH ? "rocketH" : "rocketV") : null;
    if (!type) return;
    const cell = chooseRunCell(run, isH);
    const k = `${cell.r},${cell.c}`;
    if (!specialMap[k]) specialMap[k] = { r: cell.r, c: cell.c, type: type, color: run.color };
  }
  runs.H.forEach((run) => {
    placeFromRun(run, true);
  });
  runs.V.forEach((run) => {
    placeFromRun(run, false);
  });

  for (key in specialMap) {
    if (!Object.hasOwn(specialMap, key)) continue;
    specials.push(specialMap[key]);
    delete cells[key]; // the special survives the clear, transformed
  }
  return { cells: cells, specials: specials };
}

function chooseRunCell(run: HRun | VRun, isH: boolean): Cell {
  // Prefer a swapped tile inside the run so the power-up lands where the
  // player acted; otherwise use the middle of the run.
  if (lastSwap) {
    const cands = [lastSwap.a, lastSwap.b];
    for (let i = 0; i < cands.length; i++) {
      const p = cands[i];
      if (isH && p.r === (run as HRun).r && p.c >= (run as HRun).c0 && p.c <= (run as HRun).c1)
        return p;
      if (!isH && p.c === (run as VRun).c && p.r >= (run as VRun).r0 && p.r <= (run as VRun).r1)
        return p;
    }
  }
  return isH
    ? { r: (run as HRun).r, c: (((run as HRun).c0 + (run as HRun).c1) / 2) | 0 }
    : { r: (((run as VRun).r0 + (run as VRun).r1) / 2) | 0, c: (run as VRun).c };
}

function grid(val: boolean): boolean[][] {
  const g: boolean[][] = [];
  for (let r = 0; r < N; r++) {
    g[r] = [];
    for (let c = 0; c < N; c++) g[r][c] = val;
  }
  return g;
}
function mark(set: CellMap, r: number, c: number): void {
  set[`${r},${c}`] = { r: r, c: c };
}

/* ============================ Power-up activation ============================ */
function activationCells(type: TileType, r: number, c: number, color: number): Cell[] {
  let arr: Cell[] = [];
  let i: number;
  let dr: number;
  let dc: number;
  if (type === "rocketH") {
    for (i = 0; i < N; i++) arr.push({ r: r, c: i });
  } else if (type === "rocketV") {
    for (i = 0; i < N; i++) arr.push({ r: i, c: c });
  } else if (type === "bomb") {
    for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) arr.push({ r: r + dr, c: c + dc });
  } else if (type === "rainbow") {
    const tc = color != null && color >= 0 ? color : randExistingColor();
    arr = cellsOfColor(tc);
    arr.push({ r: r, c: c });
  }
  return arr;
}

function cellsOfColor(color: number): Cell[] {
  const arr: Cell[] = [];
  eachCell((r, c, tile) => {
    if (tile && tile.type === "normal" && tile.color === color) arr.push({ r: r, c: c });
  });
  return arr;
}

function randExistingColor(): number {
  const present: Record<number, number> = {};
  eachCell((_r, _c, tile) => {
    if (tile && tile.type === "normal") present[tile.color] = 1;
  });
  const keys = Object.keys(present);
  if (!keys.length) return (Math.random() * NCOLORS) | 0;
  return +keys[(Math.random() * keys.length) | 0];
}

// Flood the activation of any power-ups touched, chaining explosions.
function gatherClear(seeds: Cell[]): CellMap {
  const out: CellMap = {};
  const q = seeds.slice();
  while (q.length) {
    const p = q.pop()!;
    if (!inBounds(p.r, p.c)) continue;
    const key = `${p.r},${p.c}`;
    if (out[key]) continue;
    const tile = board[p.r][p.c];
    if (!tile) continue;
    out[key] = { r: p.r, c: p.c };
    if (tile.type !== "normal") {
      activationCells(tile.type, p.r, p.c, tile.color).forEach((cc) => {
        q.push(cc);
      });
    }
  }
  return out;
}

/* ============================ Player move ============================ */
function adjacent(a: Cell, b: Cell): boolean {
  return (a.r === b.r && Math.abs(a.c - b.c) === 1) || (a.c === b.c && Math.abs(a.r - b.r) === 1);
}

function requestSwap(a: Cell, b: Cell): void {
  if (!canInteract()) return;
  if (!a || !b || !adjacent(a, b) || !board[a.r][a.c] || !board[b.r][b.c]) return;
  lastSwap = { a: { r: a.r, c: a.c }, b: { r: b.r, c: b.c } };
  swapCells(a, b);
  retargetSwap(a, b);
  cascade = 0;
  phase = "swap";
}

function swapCells(a: Cell, b: Cell): void {
  const tmp = board[a.r][a.c];
  board[a.r][a.c] = board[b.r][b.c];
  board[b.r][b.c] = tmp;
}

function retargetSwap(a: Cell, b: Cell): void {
  const ta = board[a.r][a.c];
  const tb = board[b.r][b.c];
  if (ta) {
    ta.tx = cellX(a.c);
    ta.ty = cellY(a.r);
  }
  if (tb) {
    tb.tx = cellX(b.c);
    tb.ty = cellY(b.r);
  }
}

function afterSwap(): void {
  const a = lastSwap!.a;
  const b = lastSwap!.b;
  const ta = board[a.r][a.c];
  const tb = board[b.r][b.c];
  const specialA = ta && ta.type !== "normal";
  const specialB = tb && tb.type !== "normal";

  if (specialA || specialB) {
    const seeds = comboSeeds(ta, a, tb, b, !!specialA, !!specialB);
    const clearSet = gatherClear(seeds);
    if (Object.keys(clearSet).length) {
      cascade = 1;
      beginClear(clearSet);
      return;
    }
  } else {
    const res = computeMatches();
    if (Object.keys(res.cells).length || res.specials.length) {
      cascade = 1;
      applySpecials(res.specials);
      beginClear(res.cells);
      return;
    }
  }
  // No effect — revert.
  swapCells(a, b);
  retargetSwap(a, b);
  phase = "swapback";
}

function comboSeeds(
  ta: Tile | null,
  a: Cell,
  tb: Tile | null,
  b: Cell,
  specialA: boolean,
  specialB: boolean,
): Cell[] {
  // Power-up + power-up: enhanced combos.
  if (specialA && specialB) {
    let seeds: Cell[] = [];
    if (ta!.type === "rainbow" && tb!.type === "rainbow") {
      eachCell((r, c) => {
        seeds.push({ r: r, c: c });
      });
      return seeds;
    }
    if (ta!.type === "rainbow" || tb!.type === "rainbow") {
      const other = ta!.type === "rainbow" ? tb! : ta!;
      seeds = cellsOfColor(other.color);
      seeds.push({ r: a.r, c: a.c }, { r: b.r, c: b.c });
      return seeds;
    }
    const isBombA = ta!.type === "bomb";
    const isBombB = tb!.type === "bomb";
    seeds.push({ r: a.r, c: a.c }, { r: b.r, c: b.c });
    let i: number;
    let j: number;
    if (isBombA && isBombB) {
      // bomb + bomb → 5×5
      for (i = -2; i <= 2; i++) for (j = -2; j <= 2; j++) seeds.push({ r: a.r + i, c: a.c + j });
    } else if (isBombA || isBombB) {
      // rocket + bomb → 3 rows + 3 cols
      for (i = -1; i <= 1; i++)
        for (j = 0; j < N; j++) {
          seeds.push({ r: a.r + i, c: j });
          seeds.push({ r: j, c: a.c + i });
        }
    } else {
      // rocket + rocket → full cross
      for (i = 0; i < N; i++) {
        seeds.push({ r: a.r, c: i });
        seeds.push({ r: i, c: a.c });
      }
    }
    return seeds;
  }

  // Power-up + normal gem.
  const sp = specialA ? ta! : tb!;
  const spP = specialA ? a : b;
  const nm = specialA ? tb : ta;
  const nmP = specialA ? b : a;
  if (sp.type === "rainbow") {
    const s = cellsOfColor(nm ? nm.color : sp.color);
    s.push({ r: spP.r, c: spP.c }, { r: nmP.r, c: nmP.c });
    return s;
  }
  return [
    { r: spP.r, c: spP.c },
    { r: nmP.r, c: nmP.c },
  ];
}

function applySpecials(specials: Special[]): void {
  specials.forEach((sp) => {
    let tile = board[sp.r][sp.c];
    if (!tile) tile = board[sp.r][sp.c] = makeTile(sp.color, sp.type);
    tile.type = sp.type;
    tile.color = sp.color;
    tile.clearing = false;
    tile.scale = 1;
    tile.tx = cellX(sp.c);
    tile.ty = cellY(sp.r);
  });
}

/* ============================ Clear / fall / resolve ============================ */
function beginClear(cellMap: CellMap): void {
  clearList = [];
  let n = 0;
  for (const key in cellMap) {
    if (!Object.hasOwn(cellMap, key)) continue;
    const p = cellMap[key];
    const tile = board[p.r][p.c];
    if (tile && !tile.clearing) {
      tile.clearing = true;
      clearList.push(p);
      n++;
    }
  }
  if (!n) {
    phase = "resolving";
    return;
  }

  const gain = n * 12 * cascade;
  score += gain;
  spawnFloater(clearList, `+${gain}`);
  syncStats();

  phaseT = 0;
  phase = "clearing";
}

function finishClear(): void {
  for (let i = 0; i < clearList.length; i++) {
    const p = clearList[i];
    board[p.r][p.c] = null;
  }
  clearList = [];
  applyGravity();
  phase = "falling";
}

function applyGravity(): void {
  for (let c = 0; c < N; c++) {
    let writeRow = N - 1;
    let r: number;
    for (r = N - 1; r >= 0; r--) {
      if (board[r][c]) {
        if (r !== writeRow) {
          const tile = board[r][c]!;
          board[writeRow][c] = tile;
          board[r][c] = null;
          tile.tx = cellX(c);
          tile.ty = cellY(writeRow);
        }
        writeRow--;
      }
    }
    // Fill the gap at the top with fresh gems dropping from above.
    let spawn = 0;
    for (r = writeRow; r >= 0; r--) {
      const nt = makeTile((Math.random() * NCOLORS) | 0, "normal");
      nt.tx = cellX(c);
      nt.ty = cellY(r);
      nt.x = cellX(c);
      nt.y = cellY(-1 - spawn); // start above the board
      board[r][c] = nt;
      spawn++;
    }
  }
}

function resolveStep(): void {
  cascade++;
  const res = computeMatches();
  if (!Object.keys(res.cells).length && !res.specials.length) {
    phase = "idle";
    cascade = 0;
    lastSwap = null;
    onIdle();
    return;
  }
  applySpecials(res.specials);
  beginClear(res.cells);
}

function onIdle(): void {
  syncStats();
  if (score > best) {
    best = score;
    store.save({ best: best });
    ui.setStat("best", best);
  }

  if (score >= goal) levelUp();

  // Endless play: when the board has no possible match, reshuffle in place
  // rather than ending the game.
  if (!anyMove()) {
    showToast(t("shuffle"));
    shuffleBoard(false);
  }
}

function levelUp(): void {
  level++;
  goal = goalFor(level);
  syncStats();
  showToast(t("levelUp").replace("{n}", String(level)));
}

function syncStats(): void {
  ui.setStat("score", score);
  ui.setStat("goal", goal);
  ui.setStat("level", level);
}

/* ============================ No-move detection / shuffle ============================ */
function anyMove(): boolean {
  let has = false;
  eachCell((_r, _c, tile) => {
    if (tile && tile.type !== "normal") has = true;
  });
  if (has) return true;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (c + 1 < N && swapMakesMatch(r, c, r, c + 1)) return true;
      if (r + 1 < N && swapMakesMatch(r, c, r + 1, c)) return true;
    }
  }
  return false;
}

function swapMakesMatch(r1: number, c1: number, r2: number, c2: number): boolean {
  const a = board[r1][c1];
  const b = board[r2][c2];
  if (!a || !b) return false;
  board[r1][c1] = b;
  board[r2][c2] = a;
  const runs = findRuns();
  board[r1][c1] = a;
  board[r2][c2] = b;
  return runs.H.length > 0 || runs.V.length > 0;
}

function shuffleBoard(snap: boolean): void {
  let guard = 0;
  do {
    const colors: number[] = [];
    eachCell((_r, _c, tile) => {
      if (tile && tile.type === "normal") colors.push(tile.color);
    });
    // Fisher–Yates over the collected colours.
    for (let i = colors.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = colors[i];
      colors[i] = colors[j];
      colors[j] = tmp;
    }
    let k = 0;
    eachCell((_r, _c, tile) => {
      if (tile && tile.type === "normal") tile.color = colors[k++];
    });
    guard++;
  } while (guard < 40 && (hasImmediateMatch() || !anyMove()));

  if (!snap) {
    // Little hop so the reshuffle is visible.
    eachCell((r, c, tile) => {
      if (!tile) return;
      tile.y = cellY(r) - 6;
      tile.tx = cellX(c);
      tile.ty = cellY(r);
    });
  }
}

function hasImmediateMatch(): boolean {
  const runs = findRuns();
  return runs.H.length > 0 || runs.V.length > 0;
}

/* ============================ Floaters / toast ============================ */
function spawnFloater(cells: Cell[], text: string): void {
  if (!cells.length) return;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < cells.length; i++) {
    sx += cellX(cells[i].c);
    sy += cellY(cells[i].r);
  }
  floaters.push({ x: sx / cells.length, y: sy / cells.length, text: text, life: 1 });
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 1400);
}

/* ============================ Update loop ============================ */
function update(): void {
  animateTiles();
  updateFloaters();

  switch (phase) {
    case "swap":
      if (settled()) afterSwap();
      break;
    // A revert can settle on top of matches left by an interrupted fall, so
    // run the resolver instead of dropping straight to idle.
    case "swapback":
      if (settled()) {
        cascade = 0;
        phase = "resolving";
      }
      break;
    case "clearing":
      phaseT++;
      if (phaseT >= CLEAR_FRAMES) finishClear();
      break;
    case "falling":
      if (settled()) phase = "resolving";
      break;
    case "resolving":
      resolveStep();
      break;
  }
}

function animateTiles(): void {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const tile = board && board[r] && board[r][c];
      if (!tile) continue;
      tile.x += (tile.tx - tile.x) * LERP;
      tile.y += (tile.ty - tile.y) * LERP;
      const target = tile.clearing ? 0 : 1;
      tile.scale += (target - tile.scale) * 0.35;
    }
  }
}

function settled(): boolean {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const tile = board[r][c];
      if (!tile) continue;
      if (Math.abs(tile.x - tile.tx) > SETTLE || Math.abs(tile.y - tile.ty) > SETTLE) return false;
    }
  }
  return true;
}

function updateFloaters(): void {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.y -= 0.7;
    f.life -= 0.02;
    if (f.life <= 0) floaters.splice(i, 1);
  }
}

/* ============================ Drawing ============================ */
function draw(): void {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  drawBoardBg();

  if (board) {
    // Draw non-clearing tiles first, clearing ones on top.
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const tile = board[r][c];
        if (tile && !tile.clearing) drawTile(tile);
      }
    }
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const ct = board[r][c];
        if (ct && ct.clearing) drawTile(ct);
      }
    }
  }

  drawSelection();
  drawFloaters();

  ctx.restore();
}

function drawBoardBg(): void {
  const s = geom.size;
  const x0 = geom.x;
  const y0 = geom.y;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      ctx.fillStyle = (r + c) & 1 ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.02)";
      roundRect(x0 + c * s + 2, y0 + r * s + 2, s - 4, s - 4, 8);
      ctx.fill();
    }
  }
}

function drawTile(tile: Tile): void {
  const s = geom.size * 0.82 * tile.scale;
  if (s < 0.5) return;
  const x = tile.x;
  const y = tile.y;

  if (tile.type === "normal") {
    drawGem(x, y, s, tile.color);
  } else if (tile.type === "rocketH" || tile.type === "rocketV") {
    drawRocket(x, y, s, tile.color, tile.type === "rocketH");
  } else if (tile.type === "bomb") {
    drawBomb(x, y, s);
  } else if (tile.type === "rainbow") {
    drawRainbow(x, y, s);
  }
}

function drawGem(x: number, y: number, s: number, color: number): void {
  const g = GEMS[color];
  const grad = ctx.createLinearGradient(x, y - s / 2, x, y + s / 2);
  grad.addColorStop(0, g.light);
  grad.addColorStop(0.5, g.base);
  grad.addColorStop(1, g.dark);
  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;

  gemPath(x, y, s, g.shape);
  ctx.fill();
  ctx.stroke();

  // Glossy highlight.
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(x - s * 0.16, y - s * 0.18, s * 0.18, s * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function gemPath(x: number, y: number, s: number, shape: GemShape): void {
  const h = s / 2;
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(x, y, h, 0, Math.PI * 2);
  } else if (shape === "square") {
    roundRectPath(x - h, y - h, s, s, s * 0.22);
  } else if (shape === "diamond") {
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + h, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x - h, y);
    ctx.closePath();
  } else if (shape === "triangle") {
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + h, y + h * 0.8);
    ctx.lineTo(x - h, y + h * 0.8);
    ctx.closePath();
  } else if (shape === "pentagon") {
    polyPath(x, y, h, 5, -Math.PI / 2);
  } else {
    polyPath(x, y, h, 6, 0);
  }
}

function polyPath(x: number, y: number, rad: number, sides: number, rot: number): void {
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * 2 * Math.PI) / sides;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawRocket(x: number, y: number, s: number, color: number, horiz: boolean): void {
  const h = s / 2;
  const g = GEMS[color];
  // Base gem disc tinted by colour so it reads as "this colour, charged".
  const grad = ctx.createRadialGradient(x - s * 0.15, y - s * 0.15, s * 0.1, x, y, h);
  grad.addColorStop(0, g.light);
  grad.addColorStop(1, g.dark);
  ctx.fillStyle = grad;
  roundRect(x - h, y - h, s, s, s * 0.24);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.lineCap = "round";

  // Double arrow showing the clear direction.
  ctx.save();
  ctx.translate(x, y);
  if (!horiz) ctx.rotate(Math.PI / 2);
  const a = h * 0.62;
  ctx.beginPath();
  ctx.moveTo(-a, 0);
  ctx.lineTo(a, 0);
  ctx.moveTo(a - h * 0.34, -h * 0.3);
  ctx.lineTo(a, 0);
  ctx.lineTo(a - h * 0.34, h * 0.3);
  ctx.moveTo(-a + h * 0.34, -h * 0.3);
  ctx.lineTo(-a, 0);
  ctx.lineTo(-a + h * 0.34, h * 0.3);
  ctx.stroke();
  ctx.restore();
}

function drawBomb(x: number, y: number, s: number): void {
  const h = s / 2;
  const grad = ctx.createRadialGradient(x - s * 0.18, y - s * 0.18, s * 0.08, x, y, h);
  grad.addColorStop(0, "#5a5a66");
  grad.addColorStop(0.6, "#22232b");
  grad.addColorStop(1, "#000");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, h * 0.86, 0, Math.PI * 2);
  ctx.fill();
  // Shine.
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(x - h * 0.3, y - h * 0.32, h * 0.16, 0, Math.PI * 2);
  ctx.fill();
  // Fuse + spark.
  ctx.strokeStyle = "#caa15a";
  ctx.lineWidth = Math.max(2, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(x + h * 0.3, y - h * 0.7);
  ctx.quadraticCurveTo(x + h * 0.7, y - h * 0.9, x + h * 0.55, y - h * 1.05);
  ctx.stroke();
  const spark = 0.6 + 0.4 * Math.sin(Date.now() / 80);
  ctx.fillStyle = `rgba(255,180,60,${spark})`;
  ctx.beginPath();
  ctx.arc(x + h * 0.55, y - h * 1.08, h * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

function drawRainbow(x: number, y: number, s: number): void {
  const h = s / 2;
  const cols = ["#ff4d6d", "#ff9a3d", "#ffd23d", "#4ddd7a", "#4d9bff", "#c46dff"];
  const spin = Date.now() / 600;
  for (let i = 0; i < cols.length; i++) {
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, h * 0.9, spin + (i * Math.PI) / 3, spin + ((i + 1) * Math.PI) / 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x, y, h * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function drawSelection(): void {
  if (!selected || !canInteract()) return;
  const s = geom.size;
  ctx.strokeStyle = "#ffd83d";
  ctx.lineWidth = 3;
  const pulse = 1 + Math.sin(Date.now() / 150) * 0.04;
  const sz = s * pulse;
  const cx = cellX(selected.c);
  const cy = cellY(selected.r);
  roundRect(cx - sz / 2 + 2, cy - sz / 2 + 2, sz - 4, sz - 4, 10);
  ctx.stroke();
}

function drawFloaters(): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < floaters.length; i++) {
    const f = floaters[i];
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.font = "800 22px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  roundRectPath(x, y, w, h, r);
}
function roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ============================ Input ============================ */
function cellAt(clientX: number, clientY: number): Cell | null {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const c = Math.floor((px - geom.x) / geom.size);
  const r = Math.floor((py - geom.y) / geom.size);
  if (!inBounds(r, c)) return null;
  return { r: r, c: c };
}

function onDown(e: MouseEvent | TouchEvent): void {
  if (!canInteract()) return;
  const pt = pointer(e);
  const cell = cellAt(pt.x, pt.y);
  if (!cell) return;
  press = { cell: cell, x: pt.x, y: pt.y };
  if (selected && adjacent(selected, cell)) {
    requestSwap(selected, cell);
    selected = null;
    press = null;
  } else {
    selected = cell;
  }
}

function onMove(e: MouseEvent | TouchEvent): void {
  if (!press || !canInteract()) return;
  const pt = pointer(e);
  const dx = pt.x - press.x;
  const dy = pt.y - press.y;
  const thresh = geom.size * 0.45;
  if (Math.abs(dx) < thresh && Math.abs(dy) < thresh) return;
  const dir =
    Math.abs(dx) > Math.abs(dy) ? { r: 0, c: dx > 0 ? 1 : -1 } : { r: dy > 0 ? 1 : -1, c: 0 };
  const to = { r: press.cell.r + dir.r, c: press.cell.c + dir.c };
  if (inBounds(to.r, to.c)) {
    requestSwap(press.cell, to);
    selected = null;
  }
  press = null;
}

function onUp(): void {
  press = null;
}

function pointer(e: MouseEvent | TouchEvent): Point {
  const te = e as TouchEvent;
  if (te.touches && te.touches.length)
    return { x: te.touches[0].clientX, y: te.touches[0].clientY };
  if (te.changedTouches && te.changedTouches.length)
    return { x: te.changedTouches[0].clientX, y: te.changedTouches[0].clientY };
  const me = e as MouseEvent;
  return { x: me.clientX, y: me.clientY };
}

canvas.addEventListener("mousedown", (e) => {
  e.preventDefault();
  onDown(e);
});
canvas.addEventListener("mousemove", onMove);
window.addEventListener("mouseup", onUp);
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    onDown(e);
  },
  { passive: false },
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    onMove(e);
  },
  { passive: false },
);
window.addEventListener("touchend", onUp);
window.addEventListener("resize", resize);

/* ============================ Overlay / flow ============================ */
function startGame(): void {
  newGame();
  state = STATE_PLAY;
  overlay.classList.add("hidden");
}

// The board reshuffles itself when it runs dry, so play is endless: the
// overlay only ever shows the intro screen.
function renderOverlay(): void {
  overlayTitle.textContent = `💎 ${t("title")}`;
  overlayHint.textContent = t("hint");
  overlayLegend.innerHTML =
    row("🚀", t("legRocket")) +
    row("💣", t("legBomb")) +
    row("🌈", t("legRainbow")) +
    row("✨", t("legCombo"));
  (overlayScore as HTMLElement).hidden = true;
  overlayAction.textContent = t("play");
}
function row(icon: string, text: string): string {
  return `<div class="gi">${icon}</div><div>${text}</div>`;
}

function onAction(): void {
  if (state === STATE_READY) startGame();
}
overlayAction.addEventListener("click", onAction);
overlayAction.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    onAction();
  },
  { passive: false },
);

MG.i18n.onChange(() => {
  if (!overlay.classList.contains("hidden")) renderOverlay();
});

/* ============================ Boot ============================ */
function loop(): void {
  update();
  draw();
  requestAnimationFrame(loop);
}

resize();
newGame();
state = STATE_READY;
renderOverlay();
loop();

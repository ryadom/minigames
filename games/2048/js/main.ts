import { MG } from "../../../shared/mg";
import type { HeaderUI, SaveStore } from "../../../shared/types";

const $ = (id: string): HTMLElement => document.getElementById(id)!;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "2048",
    score: "Score",
    best: "Best",
    intro: "Join the tiles, get to <b>2048!</b> Use arrow keys or swipe.",
    restart: "New Game",
    win: "You win!",
    over: "Game over!",
    keepGoing: "Keep going",
    tryAgain: "Try again",
    newGame: "New game",
  },
  ru: {
    title: "2048",
    score: "Счёт",
    best: "Рекорд",
    intro: "Объединяй плитки и собери <b>2048!</b> Стрелки или свайп.",
    restart: "Новая игра",
    win: "Победа!",
    over: "Игра окончена!",
    keepGoing: "Продолжить",
    tryAgain: "Ещё раз",
    newGame: "Новая игра",
  },
  es: {
    title: "2048",
    score: "Puntos",
    best: "Mejor",
    intro: "Une las fichas y llega a <b>2048!</b> Flechas o desliza.",
    restart: "Nuevo juego",
    win: "¡Ganaste!",
    over: "¡Fin del juego!",
    keepGoing: "Seguir",
    tryAgain: "Reintentar",
    newGame: "Nuevo juego",
  },
});

// Shared header: brand + language selector + Score / Best chips.
const ui: HeaderUI = MG.mountHeader({
  icon: "🔢",
  titleKey: "title",
  stats: [
    { key: "score", labelKey: "score" },
    { key: "best", labelKey: "best" },
  ],
});

const SIZE = 4;
const board = $("board");
const tilesHost = $("tiles");
const gridHost = $("grid");
const overlay = $("overlay");
const ovMsg = $("ov-msg");
const ovBtns = $("ov-btns");
const introText = $("intro-text");
const restartBtn = $("restart");

// Build the static background grid.
for (let c = 0; c < SIZE * SIZE; c++) {
  gridHost.appendChild(MG.el("div", "cell"));
}

/** A live tile: a value at a board position, with a stable id for animation. */
interface Tile {
  id: number;
  value: number;
  r: number;
  c: number;
  isNew: boolean;
  merged?: boolean;
}

type Grid = (Tile | null)[][];

/** The result of a slide in one direction. */
interface MoveResult {
  moved: boolean;
  gained: number;
  removed: Tile[];
  merged: Tile[];
}

/** The persisted save payload. */
interface Save {
  best: number;
  score: number;
  won: boolean;
  grid: number[];
}

// Versioned save: best score, plus an in-progress board so a refresh
// doesn't lose the game.
const store: SaveStore<Save> = MG.storage<Save>("2048", { version: 1 });

// --- State ---
let grid: Grid; // SIZE×SIZE of tile objects or null
let score = 0;
let best = 0;
let won = false; // reached 2048 and chose to keep going
let dead = false;
let uid = 1; // unique id per tile element
let els: Record<number, HTMLElement> = {}; // id -> DOM element
let busy = false; // input lock during a slide

const saved = store.load();
best = (saved && saved.best) || 0;
ui.setStat("best", best);

/* ---------------------------- helpers ---------------------------- */
function emptyGrid(): Grid {
  const g: Grid = [];
  for (let r = 0; r < SIZE; r++) {
    g[r] = [];
    for (let c2 = 0; c2 < SIZE; c2++) g[r][c2] = null;
  }
  return g;
}

function emptyCells(): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c2 = 0; c2 < SIZE; c2++) if (!grid[r][c2]) out.push({ r: r, c: c2 });
  return out;
}

function addRandom(isNew?: boolean): Tile | null {
  const cells = emptyCells();
  if (!cells.length) return null;
  const spot = cells[Math.floor(Math.random() * cells.length)];
  const tile: Tile = {
    id: uid++,
    value: Math.random() < 0.9 ? 2 : 4,
    r: spot.r,
    c: spot.c,
    isNew: isNew !== false,
  };
  grid[spot.r][spot.c] = tile;
  return tile;
}

function persist(): void {
  store.save({
    best: best,
    score: score,
    won: won,
    grid: serialize(),
  });
}

function serialize(): number[] {
  const flat: number[] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c2 = 0; c2 < SIZE; c2++) flat.push(grid[r][c2] ? grid[r][c2]!.value : 0);
  return flat;
}

function loadFrom(flat: number[]): void {
  grid = emptyGrid();
  let i = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c2 = 0; c2 < SIZE; c2++) {
      const v = flat[i++];
      if (v) grid[r][c2] = { id: uid++, value: v, r: r, c: c2, isNew: false };
    }
  }
}

/* ----------------------------- render ---------------------------- */
// Tile size as a fraction of the board's inner area: 4 tiles + 3 gaps,
// gap is 3.2% of board width. Positions are computed in percentages so
// the layout is fully responsive.
const GAP = 3.2; // percent of board width
const TS = (100 - GAP * (SIZE - 1)) / SIZE; // tile size percent of inner

function setBoardVars(): void {
  // --ts drives tile pixel size for font scaling.
  const inner = board.clientWidth - 2 * ((board.clientWidth * GAP) / 100);
  board.style.setProperty("--ts", `${(inner * TS) / 100}px`);
}

function pos(idx: number): number {
  return idx * (TS + GAP);
}

function digitClass(v: number): string {
  const len = String(v).length;
  return `d${Math.min(len, 5)}`;
}

function valueClass(v: number): string {
  return v <= 2048 ? `v${v}` : "vbig";
}

function makeTileEl(tile: Tile): HTMLElement {
  const el = MG.el("div", `tile ${valueClass(tile.value)}`);
  const inner = MG.el("div", `tile-inner ${digitClass(tile.value)}`, String(tile.value));
  el.appendChild(inner);
  el.style.left = `${pos(tile.c)}%`;
  el.style.top = `${pos(tile.r)}%`;
  if (tile.isNew) el.classList.add("new");
  tilesHost.appendChild(el);
  els[tile.id] = el;
  return el;
}

// Full re-sync of DOM tiles to the grid (used on load / restart).
function renderAll(): void {
  tilesHost.innerHTML = "";
  els = {};
  for (let r = 0; r < SIZE; r++)
    for (let c2 = 0; c2 < SIZE; c2++)
      if (grid[r][c2]) {
        grid[r][c2]!.isNew = false;
        makeTileEl(grid[r][c2]!);
      }
  ui.setStat("score", score);
}

function flashStat(): void {
  const v = ui.stat("score");
  if (!v) return;
  v.style.transition = "none";
  v.style.transform = "scale(1.25)";
  requestAnimationFrame(() => {
    v.style.transition = "transform 160ms ease";
    v.style.transform = "scale(1)";
  });
}

/* ------------------------------ moves ---------------------------- */
// Build the ordered list of line coordinates to traverse for a move.
// dir: 0 up, 1 right, 2 down, 3 left.
function lineFor(dir: number, k: number): { r: number; c: number }[] {
  const line: { r: number; c: number }[] = [];
  let i: number;
  if (dir === 3) {
    // left: row k, cols 0..3
    for (i = 0; i < SIZE; i++) line.push({ r: k, c: i });
  } else if (dir === 1) {
    // right: row k, cols 3..0
    for (i = SIZE - 1; i >= 0; i--) line.push({ r: k, c: i });
  } else if (dir === 0) {
    // up: col k, rows 0..3
    for (i = 0; i < SIZE; i++) line.push({ r: i, c: k });
  } else {
    // down: col k, rows 3..0
    for (i = SIZE - 1; i >= 0; i--) line.push({ r: i, c: k });
  }
  return line;
}

// Slide + merge in the given direction. Returns true if anything moved.
// Mutates grid; tiles keep their identity (and id) so the DOM can animate
// them to their new positions. Merged-away tiles are returned for removal.
function move(dir: number): MoveResult {
  let moved = false;
  let gained = 0;
  const removed: Tile[] = [];
  const mergedTiles: Tile[] = [];

  for (let k = 0; k < SIZE; k++) {
    const line = lineFor(dir, k);
    // Collect tiles along the line, in travel order.
    const seq: Tile[] = [];
    let i: number;
    for (i = 0; i < line.length; i++) {
      const t = grid[line[i].r][line[i].c];
      if (t) seq.push(t);
    }
    // Clear the line in the grid; we'll re-place compacted tiles.
    for (i = 0; i < line.length; i++) grid[line[i].r][line[i].c] = null;

    let target = 0; // next slot index along the line
    let j = 0;
    while (j < seq.length) {
      const cur = seq[j];
      const dest = line[target];
      if (j + 1 < seq.length && seq[j + 1].value === cur.value) {
        // Merge cur + next into the destination cell.
        const next = seq[j + 1];
        const newVal = cur.value * 2;
        cur.r = dest.r;
        cur.c = dest.c; // cur slides to dest
        next.r = dest.r;
        next.c = dest.c; // next slides onto dest, then dies
        const keep: Tile = {
          id: cur.id,
          value: newVal,
          r: dest.r,
          c: dest.c,
          isNew: false,
          merged: true,
        };
        grid[dest.r][dest.c] = keep;
        removed.push(next); // remove the absorbed tile el
        mergedTiles.push(keep);
        gained += newVal;
        if (newVal === 2048 && !won) won = true;
        // Slide animation for both, but only one survives in grid.
        animateTo(cur, dest.r, dest.c);
        animateTo(next, dest.r, dest.c);
        moved = true;
        j += 2;
      } else {
        grid[dest.r][dest.c] = cur;
        if (cur.r !== dest.r || cur.c !== dest.c) moved = true;
        cur.r = dest.r;
        cur.c = dest.c;
        animateTo(cur, dest.r, dest.c);
        j += 1;
      }
      target++;
    }
  }

  return { moved: moved, gained: gained, removed: removed, merged: mergedTiles };
}

function animateTo(tile: Tile, r: number, c: number): void {
  const el = els[tile.id];
  if (!el) return;
  el.style.left = `${pos(c)}%`;
  el.style.top = `${pos(r)}%`;
}

function applyMove(dir: number): void {
  if (busy || dead) return;
  const res = move(dir);
  if (!res.moved) return;

  busy = true;

  // After the slide transition, settle: remove absorbed tiles, bump the
  // merged ones, update their value class, spawn a new tile, re-check.
  window.setTimeout(() => {
    let i: number;
    for (i = 0; i < res.removed.length; i++) {
      const rel = els[res.removed[i].id];
      if (rel?.parentNode) rel.parentNode.removeChild(rel);
      delete els[res.removed[i].id];
    }
    for (i = 0; i < res.merged.length; i++) {
      const m = res.merged[i];
      const mel = els[m.id];
      if (mel) {
        mel.className = `tile ${valueClass(m.value)}`;
        const inner = mel.firstChild as HTMLElement;
        inner.className = `tile-inner ${digitClass(m.value)}`;
        inner.textContent = String(m.value);
        mel.classList.add("merged");
        ((e: HTMLElement) => {
          window.setTimeout(() => {
            e.classList.remove("merged");
          }, 170);
        })(mel);
      }
    }

    if (res.gained) {
      score += res.gained;
      ui.setStat("score", score);
      flashStat();
      if (score > best) {
        best = score;
        ui.setStat("best", best);
      }
    }

    const spawned = addRandom(true);
    if (spawned) makeTileEl(spawned);

    persist();
    busy = false;

    if (won && !overlay.classList.contains("seen-win")) {
      showOverlay(true);
    } else if (!hasMoves()) {
      dead = true;
      showOverlay(false);
    }
  }, 120);
}

function hasMoves(): boolean {
  if (emptyCells().length) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c2 = 0; c2 < SIZE; c2++) {
      const v = grid[r][c2]!.value;
      if (c2 + 1 < SIZE && grid[r][c2 + 1]!.value === v) return true;
      if (r + 1 < SIZE && grid[r + 1][c2]!.value === v) return true;
    }
  }
  return false;
}

/* ----------------------------- overlay --------------------------- */
function showOverlay(isWin: boolean): void {
  const t = MG.i18n.t;
  overlay.className = `overlay${isWin ? " win win-continue seen-win" : ""}`;
  ovMsg.textContent = isWin ? t("win") : t("over");
  ovBtns.innerHTML = "";
  if (isWin) {
    const keep = MG.el("button", "ov-btn", t("keepGoing"));
    keep.addEventListener("click", () => {
      overlay.classList.add("hidden");
    });
    const ng = MG.el("button", "ov-btn alt", t("newGame"));
    ng.addEventListener("click", restart);
    ovBtns.appendChild(keep);
    ovBtns.appendChild(ng);
  } else {
    const again = MG.el("button", "ov-btn", t("tryAgain"));
    again.addEventListener("click", restart);
    ovBtns.appendChild(again);
  }
  overlay.classList.remove("hidden");
}

/* ------------------------------ setup ---------------------------- */
function restart(): void {
  grid = emptyGrid();
  score = 0;
  won = false;
  dead = false;
  ui.setStat("score", 0);
  addRandom(true);
  addRandom(true);
  overlay.className = "overlay hidden";
  renderAll();
  persist();
}

function bootFromSave(s: Save): void {
  loadFrom(s.grid);
  score = s.score || 0;
  won = !!s.won;
  dead = false;
  // If the saved board has no moves left, it's already over.
  renderAll();
  if (won) overlay.classList.add("seen-win", "win-continue");
  if (!hasMoves()) {
    dead = true;
    showOverlay(false);
  }
}

/* ------------------------------ input ---------------------------- */
const KEYS: Record<string, number> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  KeyW: 0,
  KeyD: 1,
  KeyS: 2,
  KeyA: 3,
  k: 0,
  l: 1,
  j: 2,
  h: 3,
};
window.addEventListener("keydown", (e: KeyboardEvent) => {
  let dir = KEYS[e.code];
  if (dir == null) dir = KEYS[e.key];
  if (dir == null) return;
  e.preventDefault();
  applyMove(dir);
});

// Touch swipe.
let sx = 0;
let sy = 0;
let tracking = false;
board.addEventListener(
  "touchstart",
  (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    tracking = true;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  },
  { passive: true },
);
board.addEventListener(
  "touchmove",
  (e: TouchEvent) => {
    if (tracking) e.preventDefault();
  },
  { passive: false },
);
board.addEventListener(
  "touchend",
  (e: TouchEvent) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 24) return; // ignore taps
    if (ax > ay) applyMove(dx > 0 ? 1 : 3);
    else applyMove(dy > 0 ? 2 : 0);
  },
  { passive: true },
);

restartBtn.addEventListener("click", restart);

// Re-localize live strings on language change.
function refreshText(): void {
  introText.innerHTML = MG.i18n.t("intro");
  restartBtn.textContent = MG.i18n.t("restart");
  if (!overlay.classList.contains("hidden")) {
    showOverlay(overlay.classList.contains("win"));
  }
}
MG.i18n.onChange(refreshText);

window.addEventListener("resize", setBoardVars);

/* ------------------------------ boot ----------------------------- */
refreshText();
setBoardVars();
if (saved && saved.grid && saved.grid.some((v) => v)) {
  bootFromSave(saved);
} else {
  restart();
}

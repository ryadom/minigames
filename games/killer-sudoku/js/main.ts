import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "KILLER SUDOKU",
    difficulty: "Difficulty",
    time: "Time",
    mistakes: "Mistakes",
    new: "↻ New",
    check: "✓ Check",
    chooseTitle: "New game",
    chooseSub: "Pick a difficulty",
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
    expert: "Expert",
    cluesTag: "clues",
    fewClues: "fewest clues",
    building: "Building cages…",
    notes: "✎ Notes",
    erase: "⌫",
    winTitle: "Solved!",
    winSub: "Difficulty %d · time %t · mistakes %m",
    again: "↻ Play again",
    diffNames: { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" },
  },
  ru: {
    title: "КИЛЛЕР СУДОКУ",
    difficulty: "Сложность",
    time: "Время",
    mistakes: "Ошибки",
    new: "↻ Новая",
    check: "✓ Проверить",
    chooseTitle: "Новая игра",
    chooseSub: "Выберите сложность",
    easy: "Лёгкий",
    medium: "Средний",
    hard: "Сложный",
    expert: "Эксперт",
    cluesTag: "подсказок",
    fewClues: "минимум подсказок",
    building: "Строим клетки…",
    notes: "✎ Заметки",
    erase: "⌫",
    winTitle: "Решено!",
    winSub: "Сложность %d · время %t · ошибки %m",
    again: "↻ Играть снова",
    diffNames: { easy: "Лёгкий", medium: "Средний", hard: "Сложный", expert: "Эксперт" },
  },
  es: {
    title: "KILLER SUDOKU",
    difficulty: "Dificultad",
    time: "Tiempo",
    mistakes: "Errores",
    new: "↻ Nueva",
    check: "✓ Revisar",
    chooseTitle: "Nueva partida",
    chooseSub: "Elige una dificultad",
    easy: "Fácil",
    medium: "Medio",
    hard: "Difícil",
    expert: "Experto",
    cluesTag: "pistas",
    fewClues: "mínimo de pistas",
    building: "Creando jaulas…",
    notes: "✎ Notas",
    erase: "⌫",
    winTitle: "¡Resuelto!",
    winSub: "Dificultad %d · tiempo %t · errores %m",
    again: "↻ Jugar de nuevo",
    diffNames: { easy: "Fácil", medium: "Medio", hard: "Difícil", expert: "Experto" },
  },
});

interface Diff {
  id: string;
  clues: number;
  maxCage: number;
}

// Difficulty config: `clues` is the *floor* of revealed givens we dig down
// to, `maxCage` the largest cage size allowed. Fewer clues + bigger cages
// = harder. Expert is a pure Killer (no givens at all).
const DIFFS: Diff[] = [
  { id: "easy", clues: 10, maxCage: 3 },
  { id: "medium", clues: 6, maxCage: 4 },
  { id: "hard", clues: 2, maxCage: 4 },
  { id: "expert", clues: 0, maxCage: 5 },
];

const ui: HeaderUI = MG.mountHeader({
  icon: "🗡️",
  titleKey: "title",
  stats: [
    { key: "diff", labelKey: "difficulty", variant: "sm", value: "—" },
    { key: "time", labelKey: "time", variant: "sm", value: "0:00" },
    { key: "miss", labelKey: "mistakes", variant: "alert", value: "0" },
  ],
  actions: [
    {
      key: "check",
      labelKey: "check",
      onClick: () => {
        checkBoard();
      },
    },
    {
      key: "new",
      labelKey: "new",
      onClick: () => {
        openChooser();
      },
    },
  ],
});

/* ====================== shared helpers ====================== */
function shuffled<T>(a: T[]): T[] {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

const BOX: number[] = new Array(81);
for (let bi = 0; bi < 81; bi++) {
  const br = ((bi / 9) | 0) - (((bi / 9) | 0) % 3);
  const bc = (bi % 9) - ((bi % 9) % 3);
  BOX[bi] = (br / 3) * 3 + bc / 3; // 0..8 box index
}

// Orthogonal neighbours of a cell index (for growing contiguous cages).
function neighbours(p: number): number[] {
  const r = (p / 9) | 0;
  const c = p % 9;
  const out: number[] = [];
  if (r > 0) out.push(p - 9);
  if (r < 8) out.push(p + 9);
  if (c > 0) out.push(p - 1);
  if (c < 8) out.push(p + 1);
  return out;
}

/* ================ full-solution generation (plain Sudoku) ============= */
function okFull(b: number[], r: number, c: number, v: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (b[r * 9 + i] === v) return false;
    if (b[i * 9 + c] === v) return false;
  }
  const brr = r - (r % 3);
  const bcc = c - (c % 3);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) if (b[(brr + y) * 9 + bcc + x] === v) return false;
  return true;
}

function fillSolution(b: number[], pos: number): boolean {
  if (pos === 81) return true;
  const nums = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const r = (pos / 9) | 0;
  const c = pos % 9;
  for (let i = 0; i < 9; i++) {
    const v = nums[i];
    if (okFull(b, r, c, v)) {
      b[pos] = v;
      if (fillSolution(b, pos + 1)) return true;
      b[pos] = 0;
    }
  }
  return false;
}

/* ========================= cage partitioning ========================= */
interface Cage {
  cells: number[];
  sum: number;
}

interface CageResult {
  cageOf: number[];
  cages: Cage[];
}

// Grow contiguous cages over the solved grid. A cage never repeats a digit
// (that's a Killer rule), so a cage's target sum + the no-repeat rule fully
// describe it. Returns { cageOf:Int(81), cages:[{cells, sum}] }.
function makeCages(sol: number[], maxCage: number): CageResult {
  const cageOf: number[] = new Array(81).fill(-1);
  const cages: Cage[] = [];
  const order = shuffled(Array.from({ length: 81 }, (_, i) => i));

  for (let oi = 0; oi < order.length; oi++) {
    const start = order[oi];
    if (cageOf[start] !== -1) continue;
    const id = cages.length;
    const cells = [start];
    let digitMask = 1 << sol[start];
    cageOf[start] = id;
    const target = 2 + ((Math.random() * (maxCage - 1)) | 0); // 2..maxCage

    while (cells.length < target) {
      // Frontier: unassigned neighbours whose digit isn't in this cage yet.
      const frontier: number[] = [];
      for (let ci = 0; ci < cells.length; ci++) {
        const ns = neighbours(cells[ci]);
        for (let ni = 0; ni < ns.length; ni++) {
          const q = ns[ni];
          if (cageOf[q] === -1 && !(digitMask & (1 << sol[q])) && frontier.indexOf(q) === -1)
            frontier.push(q);
        }
      }
      if (!frontier.length) break;
      const pick = frontier[(Math.random() * frontier.length) | 0];
      cageOf[pick] = id;
      cells.push(pick);
      digitMask |= 1 << sol[pick];
    }

    let sum = 0;
    for (let si = 0; si < cells.length; si++) sum += sol[cells[si]];
    cages.push({ cells: cells, sum: sum });
  }

  // Absorb stray single-cell cages into a neighbouring cage when the digit
  // allows — lone cages just hand the answer away and look noisy.
  for (let gi = cages.length - 1; gi >= 0; gi--) {
    if (cages[gi].cells.length !== 1) continue;
    const only = cages[gi].cells[0];
    const nbs = shuffled(neighbours(only));
    for (let k = 0; k < nbs.length; k++) {
      const g2 = cageOf[nbs[k]];
      if (g2 === gi) continue;
      const host = cages[g2];
      if (host.cells.length >= maxCage) continue;
      let dup = false;
      for (let hc = 0; hc < host.cells.length; hc++)
        if (sol[host.cells[hc]] === sol[only]) {
          dup = true;
          break;
        }
      if (dup) continue;
      host.cells.push(only);
      host.sum += sol[only];
      cageOf[only] = g2;
      cages.splice(gi, 1);
      break;
    }
  }
  // Re-index cageOf after any removals.
  for (let rg = 0; rg < cages.length; rg++)
    for (let rc2 = 0; rc2 < cages[rg].cells.length; rc2++) cageOf[cages[rg].cells[rc2]] = rg;

  return { cageOf: cageOf, cages: cages };
}

/* ===================== killer solver / counter ====================== */
// Lookup tables shared by every solver instance:
//   POP[mask]            — popcount of a 0..0x3FF mask
//   RMIN/RMAX[mask*10+k] — min/max sum of k distinct digits drawn from
//                          `mask` (bits 1..9), or -1 if fewer than k exist.
// These turn the solver's hot path (cage-sum feasibility) into table reads.
const POP = new Uint8Array(1024);
for (let pm = 0; pm < 1024; pm++) {
  let pc = 0;
  let px = pm;
  while (px) {
    pc += px & 1;
    px >>= 1;
  }
  POP[pm] = pc;
}
const RMIN = new Int16Array(1024 * 10);
const RMAX = new Int16Array(1024 * 10);
for (let rmMask = 0; rmMask < 1024; rmMask++) {
  const digs: number[] = [];
  for (let rd = 1; rd <= 9; rd++) if (rmMask & (1 << rd)) digs.push(rd);
  for (let rk = 0; rk <= 9; rk++) {
    const idx0 = rmMask * 10 + rk;
    if (rk > digs.length) {
      RMIN[idx0] = -1;
      RMAX[idx0] = -1;
      continue;
    }
    let mn = 0;
    let mx = 0;
    for (let ra = 0; ra < rk; ra++) mn += digs[ra];
    for (let rb = 0; rb < rk; rb++) mx += digs[digs.length - 1 - rb];
    RMIN[idx0] = mn;
    RMAX[idx0] = mx;
  }
}

interface CountResult {
  count: number;
  capped: boolean;
}

type Solver = (clues: number[], limit: number, nodeCap: number) => CountResult;

// Counts solutions of a Killer grid (given clues + cages), capped at
// `limit`. Uses bitmask constraints, cage-sum bounds and an MRV cell pick.
// `nodeCap` bails out (returns the capped count so far) to keep generation
// snappy; an exhausted cap is treated by the caller as "too hard / keep".
function makeSolver(cageOf: number[], cages: Cage[]): Solver {
  return function count(clues: number[], limit: number, nodeCap: number): CountResult {
    const grid = clues.slice();
    const rowM: number[] = new Array(9).fill(0);
    const colM: number[] = new Array(9).fill(0);
    const boxM: number[] = new Array(9).fill(0);
    const cageUsed: number[] = new Array(cages.length).fill(0);
    const cageRem: number[] = new Array(cages.length); // remaining sum
    const cageLeft: number[] = new Array(cages.length); // remaining empty cells
    let i: number;
    let g: number;

    for (g = 0; g < cages.length; g++) {
      cageRem[g] = cages[g].sum;
      cageLeft[g] = cages[g].cells.length;
    }
    for (i = 0; i < 81; i++) {
      const v = grid[i];
      if (!v) continue;
      const bit = 1 << v;
      const r = (i / 9) | 0;
      const c = i % 9;
      rowM[r] |= bit;
      colM[c] |= bit;
      boxM[BOX[i]] |= bit;
      g = cageOf[i];
      cageUsed[g] |= bit;
      cageRem[g] -= v;
      cageLeft[g]--;
    }

    let nodeN = 0;
    let capped = false;

    function candMask(i: number): number {
      const g2 = cageOf[i];
      const r = (i / 9) | 0;
      const c = i % 9;
      const used = rowM[r] | colM[c] | boxM[BOX[i]] | cageUsed[g2];
      const avail = ~used & 0x3fe; // bits 1..9
      if (!avail) return 0;
      const rem = cageRem[g2];
      const left = cageLeft[g2];
      if (left === 1) {
        // last cell must equal the rest
        const lb = 1 << rem;
        return avail & lb ? lb : 0;
      }
      let ok = 0;
      const base = cageUsed[g2];
      const km = left - 1;
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << d;
        if (!(avail & bit)) continue;
        const after = rem - d;
        if (after <= 0) continue;
        const idx = (~(base | bit) & 0x3fe) * 10 + km;
        const mn = RMIN[idx];
        if (mn < 0) continue;
        if (after >= mn && after <= RMAX[idx]) ok |= bit;
      }
      return ok;
    }

    let total = 0;

    function recurse(): void {
      if (capped) return;
      if (++nodeN > nodeCap) {
        capped = true;
        return;
      }

      // MRV: empty cell with the fewest candidates.
      let best = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let i = 0; i < 81; i++) {
        if (grid[i]) continue;
        const m = candMask(i);
        const cnt = POP[m];
        if (cnt === 0) return; // dead end
        if (cnt < bestCount) {
          bestCount = cnt;
          best = i;
          bestMask = m;
          if (cnt === 1) break;
        }
      }
      if (best === -1) {
        total++;
        return;
      } // full grid — a solution

      const r = (best / 9) | 0;
      const c = best % 9;
      const b = BOX[best];
      const g = cageOf[best];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        grid[best] = d;
        rowM[r] |= bit;
        colM[c] |= bit;
        boxM[b] |= bit;
        cageUsed[g] |= bit;
        cageRem[g] -= d;
        cageLeft[g]--;

        recurse();

        grid[best] = 0;
        rowM[r] &= ~bit;
        colM[c] &= ~bit;
        boxM[b] &= ~bit;
        cageUsed[g] &= ~bit;
        cageRem[g] += d;
        cageLeft[g]++;

        if (total >= limit || capped) return;
      }
    }

    recurse();
    return { count: total, capped: capped };
  };
}

/* ======================= puzzle generation ========================= */
interface Puzzle {
  solution: number[];
  cageOf: number[];
  cages: Cage[];
  puzzle: number[];
}

// Build a solvable Killer puzzle: solved grid → cages → dig clues out while
// the cage constraints keep the solution unique, down to the target floor.
function generate(diff: Diff): Puzzle {
  let solution: number[] = new Array(81).fill(0);
  let cageOf: number[] = [];
  let cages: Cage[] = [];
  let solve: Solver = makeSolver(cageOf, cages);

  // A few cage layouts may be unique with zero clues already; try a couple.
  for (let attempt = 0; attempt < 4; attempt++) {
    solution = new Array(81).fill(0);
    fillSolution(solution, 0);
    const cg = makeCages(solution, diff.maxCage);
    cageOf = cg.cageOf;
    cages = cg.cages;
    solve = makeSolver(cageOf, cages);
    if (diff.clues === 0) {
      const res = solve(new Array(81).fill(0), 2, 400000);
      if (!res.capped && res.count === 1) {
        return {
          solution: solution,
          cageOf: cageOf,
          cages: cages,
          puzzle: new Array(81).fill(0),
        };
      }
    } else {
      break; // easier levels keep clues, so any layout works
    }
  }

  // Dig: start from the full solution and remove clues while unique.
  const puzzle = solution.slice();
  const order = shuffled(Array.from({ length: 81 }, (_, i) => i));
  let remaining = 81;
  for (let oi = 0; oi < order.length && remaining > diff.clues; oi++) {
    const p = order[oi];
    const saved = puzzle[p];
    puzzle[p] = 0;
    const r = solve(puzzle, 2, 120000);
    if (r.capped || r.count !== 1)
      puzzle[p] = saved; // ambiguous — keep it
    else remaining--;
  }
  return { solution: solution, cageOf: cageOf, cages: cages, puzzle: puzzle };
}

/* ============================ state ============================ */
let board: number[] = []; // current values, 0 = empty
let given: boolean[] = []; // boolean: is this a fixed clue?
let solution: number[] = []; // the answer
let notes: number[][] = []; // array(81) of arrays of pencil marks
let cageOf: number[] = []; // array(81): cage id per cell
let cages: Cage[] = []; // [{ cells, sum }]
let diffId = "easy";
let mistakes = 0;
let seconds = 0;
let selected = -1;
let notesMode = false;
let solved = false;
let timer: ReturnType<typeof setInterval> | null = null;

let cells: HTMLDivElement[] = []; // DOM cell references

/* ============================ board DOM ============================ */
function buildGrid(): void {
  const grid = $("board");
  grid.innerHTML = "";
  cells = [];
  for (let i = 0; i < 81; i++) {
    const r = (i / 9) | 0;
    const c = i % 9;
    const el = document.createElement("div");
    el.className = "cell";
    if (c % 3 === 2 && c !== 8) el.className += " bx-r";
    if (r % 3 === 2 && r !== 8) el.className += " bx-b";
    ((idx) => {
      el.addEventListener("pointerdown", () => {
        select(idx);
      });
    })(i);
    grid.appendChild(el);
    cells.push(el);
  }
}

// Paint the dashed cage outlines + each cage's total in its corner cell.
function renderCages(): void {
  // Top-left (smallest index) cell of each cage carries the sum label.
  const anchor: number[] = new Array(cages.length).fill(Infinity);
  for (let g = 0; g < cages.length; g++) {
    for (let k = 0; k < cages[g].cells.length; k++)
      if (cages[g].cells[k] < anchor[g]) anchor[g] = cages[g].cells[k];
  }
  for (let i = 0; i < 81; i++) {
    const el = cells[i];
    const r = (i / 9) | 0;
    const c = i % 9;
    const mine = cageOf[i];
    const cage = document.createElement("div");
    cage.className = "cage";
    if (r === 0 || cageOf[i - 9] !== mine) cage.className += " ct";
    if (r === 8 || cageOf[i + 9] !== mine) cage.className += " cb";
    if (c === 0 || cageOf[i - 1] !== mine) cage.className += " cl";
    if (c === 8 || cageOf[i + 1] !== mine) cage.className += " cr";
    el.appendChild(cage);
    if (anchor[mine] === i) {
      const sum = document.createElement("div");
      sum.className = "cage-sum";
      sum.textContent = String(cages[mine].sum);
      el.appendChild(sum);
    }
  }
}

function renderCell(i: number): void {
  const el = cells[i];
  const v = board[i];
  // Keep the cage outline + sum children; clear value/notes only.
  const old = el.querySelector(".value");
  if (old) el.removeChild(old);
  const oldNotes = el.querySelector(".notes");
  if (oldNotes) el.removeChild(oldNotes);

  el.classList.toggle("given", given[i]);
  el.classList.remove("conflict");

  if (v) {
    const span = document.createElement("span");
    span.className = "value";
    span.textContent = String(v);
    el.appendChild(span);
    if (!given[i] && hasConflict(i)) el.classList.add("conflict");
  } else if (notes[i] && notes[i].length) {
    const wrap = document.createElement("div");
    wrap.className = "notes";
    for (let n = 1; n <= 9; n++) {
      const s = document.createElement("span");
      s.textContent = notes[i].indexOf(n) >= 0 ? String(n) : "";
      wrap.appendChild(s);
    }
    el.appendChild(wrap);
  }
}

function renderAll(): void {
  for (let i = 0; i < 81; i++) renderCell(i);
  paintCageStatus();
  paintSelection();
}

// Does the value at i clash in its row/col/box, or repeat within its cage?
function hasConflict(i: number): boolean {
  const v = board[i];
  if (!v) return false;
  const r = (i / 9) | 0;
  const c = i % 9;
  for (let k = 0; k < 9; k++) {
    const rc = r * 9 + k;
    const cr = k * 9 + c;
    if (rc !== i && board[rc] === v) return true;
    if (cr !== i && board[cr] === v) return true;
  }
  const br = r - (r % 3);
  const bc = c - (c % 3);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      const p = (br + y) * 9 + bc + x;
      if (p !== i && board[p] === v) return true;
    }
  // Cage repeat.
  const cg = cages[cageOf[i]];
  for (let m = 0; m < cg.cells.length; m++) {
    const q = cg.cells[m];
    if (q !== i && board[q] === v) return true;
  }
  return false;
}

// Flag cages whose filled total already breaks the target, and crown the
// ones that are fully (and correctly) completed.
function paintCageStatus(): void {
  for (let g = 0; g < cages.length; g++) {
    const cg = cages[g];
    let sum = 0;
    let filled = 0;
    let dup = false;
    let seen = 0;
    for (let k = 0; k < cg.cells.length; k++) {
      const v = board[cg.cells[k]];
      if (v) {
        sum += v;
        filled++;
        if (seen & (1 << v)) dup = true;
        seen |= 1 << v;
      }
    }
    const full = filled === cg.cells.length;
    const bad = dup || sum > cg.sum || (full && sum !== cg.sum);
    const done = full && !bad && sum === cg.sum;
    // The anchor cell holds the sum label; toggle its state classes.
    let anchor = cg.cells[0];
    for (let a = 1; a < cg.cells.length; a++) if (cg.cells[a] < anchor) anchor = cg.cells[a];
    cells[anchor].classList.toggle("cage-bad", bad);
    cells[anchor].classList.toggle("cage-done", done);
  }
}

/* ============================ selection ============================ */
function select(i: number): void {
  selected = i;
  paintSelection();
}

function paintSelection(): void {
  const selVal = selected >= 0 ? board[selected] : 0;
  const sr = selected >= 0 ? (selected / 9) | 0 : -1;
  const sc = selected >= 0 ? selected % 9 : -1;
  const sbr = sr - (sr % 3);
  const sbc = sc - (sc % 3);
  const selCage = selected >= 0 ? cageOf[selected] : -1;
  for (let i = 0; i < 81; i++) {
    const el = cells[i];
    const r = (i / 9) | 0;
    const c = i % 9;
    el.classList.remove("sel", "peer", "same", "cage-hl");
    if (selected < 0) continue;
    if (cageOf[i] === selCage) el.classList.add("cage-hl");
    if (i === selected) {
      el.classList.add("sel");
      continue;
    }
    const inBox = r >= sbr && r < sbr + 3 && c >= sbc && c < sbc + 3;
    if (r === sr || c === sc || inBox) el.classList.add("peer");
    if (selVal && board[i] === selVal) el.classList.add("same");
  }
}

/* ============================ input ============================ */
function enter(v: number): void {
  if (solved || selected < 0 || given[selected]) return;
  const i = selected;

  if (v === 0) {
    // erase
    board[i] = 0;
    notes[i] = [];
    afterChange(i);
    return;
  }

  if (notesMode) {
    if (board[i]) return; // can't note over a filled cell
    const pos = notes[i].indexOf(v);
    if (pos >= 0) notes[i].splice(pos, 1);
    else notes[i].push(v);
    renderCell(i);
    scheduleSave();
    return;
  }

  // Toggle off if re-entering the same value.
  if (board[i] === v) {
    board[i] = 0;
    afterChange(i);
    return;
  }

  board[i] = v;
  notes[i] = [];
  if (v !== solution[i]) {
    mistakes++;
    ui.setStat("miss", mistakes);
    flashMiss();
  } else {
    clearPeerNotes(i, v);
  }
  afterChange(i);
}

// When a correct number is placed, remove that pencil mark from peers
// (row, column, box and cage).
function clearPeerNotes(i: number, v: number): void {
  const r = (i / 9) | 0;
  const c = i % 9;
  const br = r - (r % 3);
  const bc = c - (c % 3);
  function strip(p: number): void {
    if (!notes[p]) return;
    const pos = notes[p].indexOf(v);
    if (pos >= 0) {
      notes[p].splice(pos, 1);
      renderCell(p);
    }
  }
  for (let k = 0; k < 9; k++) {
    strip(r * 9 + k);
    strip(k * 9 + c);
  }
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) strip((br + y) * 9 + bc + x);
  const cg = cages[cageOf[i]];
  for (let m = 0; m < cg.cells.length; m++) strip(cg.cells[m]);
}

function afterChange(_i: number): void {
  // Conflicts + cage totals can change broadly, so repaint everything.
  renderAll();
  updatePad();
  scheduleSave();
  checkWin();
}

function flashMiss(): void {
  const e = ui.stat("miss");
  if (!e) return;
  e.classList.remove("mg-flash");
  void e.offsetWidth;
  e.classList.add("mg-flash");
}

document.addEventListener("keydown", (e: KeyboardEvent) => {
  if ($("overlay").classList.contains("show")) return;
  if (e.key >= "1" && e.key <= "9") {
    enter(+e.key);
    e.preventDefault();
    return;
  }
  if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
    enter(0);
    e.preventDefault();
    return;
  }
  if (e.key === "n" || e.key === "N") {
    toggleNotes();
    return;
  }
  // Arrow-key navigation.
  if (selected < 0) return;
  let r = (selected / 9) | 0;
  let c = selected % 9;
  let moved = true;
  if (e.key === "ArrowUp") r = (r + 8) % 9;
  else if (e.key === "ArrowDown") r = (r + 1) % 9;
  else if (e.key === "ArrowLeft") c = (c + 8) % 9;
  else if (e.key === "ArrowRight") c = (c + 1) % 9;
  else moved = false;
  if (moved) {
    select(r * 9 + c);
    e.preventDefault();
  }
});

/* ============================ number pad ============================ */
function buildPad(): void {
  const pad = $("pad");
  pad.innerHTML = "";
  for (let n = 1; n <= 9; n++) {
    ((v) => {
      const b = document.createElement("button");
      b.className = "pad-btn num";
      b.dataset.v = String(v);
      b.innerHTML = `${v}<span class="left"></span>`;
      b.addEventListener("click", () => {
        enter(v);
      });
      pad.appendChild(b);
    })(n);
  }
  const notesBtn = document.createElement("button");
  notesBtn.className = "pad-btn pad-wide";
  notesBtn.id = "notesToggle";
  notesBtn.addEventListener("click", toggleNotes);
  pad.appendChild(notesBtn);

  const eraseBtn = document.createElement("button");
  eraseBtn.className = "pad-btn pad-wide";
  eraseBtn.id = "eraseBtn";
  eraseBtn.addEventListener("click", () => {
    enter(0);
  });
  pad.appendChild(eraseBtn);

  relabelPad();
}

function relabelPad(): void {
  const nb = $<HTMLButtonElement>("notesToggle");
  const eb = $<HTMLButtonElement>("eraseBtn");
  if (nb) nb.textContent = MG.i18n.t("notes");
  if (eb) eb.textContent = MG.i18n.t("erase");
  if (nb) nb.classList.toggle("on", notesMode);
}

// Grey out a digit once all nine are correctly placed; show how many remain.
function updatePad(): void {
  const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 81; i++) {
    if (board[i] && board[i] === solution[i]) counts[board[i]]++;
  }
  const btns = $("pad").querySelectorAll<HTMLButtonElement>(".num");
  btns.forEach((b) => {
    const v = +(b.dataset.v as string);
    const left = 9 - counts[v];
    b.classList.toggle("done", left <= 0);
    (b.querySelector(".left") as HTMLElement).textContent = left > 0 ? String(left) : "";
  });
}

function toggleNotes(): void {
  notesMode = !notesMode;
  relabelPad();
}

/* ============================ check / win ============================ */
// Flash every wrong entry red briefly.
function checkBoard(): void {
  for (let i = 0; i < 81; i++) {
    if (board[i] && !given[i] && board[i] !== solution[i]) {
      cells[i].classList.add("conflict");
    }
  }
}

function isComplete(): boolean {
  for (let i = 0; i < 81; i++) if (board[i] !== solution[i]) return false;
  return true;
}

function checkWin(): void {
  if (solved || !isComplete()) return;
  solved = true;
  stopTimer();
  selected = -1;
  renderAll();
  scheduleSave();
  showWin();
}

/* ============================ timer ============================ */
function fmtTime(s: number): string {
  const m = (s / 60) | 0;
  const ss = s % 60;
  return `${m}:${ss < 10 ? "0" : ""}${ss}`;
}
function tick(): void {
  seconds++;
  ui.setStat("time", fmtTime(seconds));
  if (seconds % 5 === 0) scheduleSave();
}
function startTimer(): void {
  stopTimer();
  if (!solved) timer = setInterval(tick, 1000);
}
function stopTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/* ============================ overlay ============================ */
function diffLabel(id: string): string {
  return MG.i18n.t<Record<string, string>>("diffNames")[id] || id;
}

function clueTag(d: Diff): string {
  if (d.clues === 0) return MG.i18n.t("fewClues");
  return `≤ ${d.clues} ${MG.i18n.t("cluesTag")}`;
}

function openChooser(): void {
  stopTimer();
  let html =
    `<h2>${MG.i18n.t("chooseTitle")}</h2>` + `<p>${MG.i18n.t("chooseSub")}</p><div class="diffs">`;
  DIFFS.forEach((d) => {
    html +=
      `<button class="diff" data-id="${d.id}">` +
      `<span>${diffLabel(d.id)}</span>` +
      `<span class="tag">${clueTag(d)}</span>` +
      `</button>`;
  });
  html += "</div>";
  const panel = $("panel");
  panel.innerHTML = html;
  panel.querySelectorAll<HTMLButtonElement>(".diff").forEach((b) => {
    b.addEventListener("click", () => {
      newGame(b.dataset.id as string);
    });
  });
  $("overlay").classList.add("show");
}

function showBuilding(): void {
  $("panel").innerHTML =
    `<h2>${MG.i18n.t("chooseTitle")}</h2>` +
    `<div class="spin"></div>` +
    `<p style="margin:0">${MG.i18n.t("building")}</p>`;
  $("overlay").classList.add("show");
}

function showWin(): void {
  const sub = MG.i18n
    .t("winSub")
    .replace("%d", diffLabel(diffId))
    .replace("%t", fmtTime(seconds))
    .replace("%m", String(mistakes));
  $("panel").innerHTML =
    `<div class="win-emoji">🎉</div>` +
    `<h2>${MG.i18n.t("winTitle")}</h2>` +
    `<p>${sub}</p>` +
    `<div class="diffs"><button class="diff" id="againBtn" style="justify-content:center">${MG.i18n.t(
      "again",
    )}</button></div>`;
  $("againBtn").addEventListener("click", openChooser);
  $("overlay").classList.add("show");
}

function closeOverlay(): void {
  $("overlay").classList.remove("show");
}

/* ============================ new game ============================ */
function newGame(id: string): void {
  diffId = id;
  const d = DIFFS.filter((x) => x.id === id)[0] || DIFFS[0];
  showBuilding();
  // Defer the (synchronous, heavy) generation so the spinner can paint.
  setTimeout(() => {
    const g = generate(d);
    solution = g.solution;
    board = g.puzzle.slice();
    given = g.puzzle.map((v) => v !== 0);
    cageOf = g.cageOf;
    cages = g.cages;
    notes = [];
    for (let i = 0; i < 81; i++) notes.push([]);
    mistakes = 0;
    seconds = 0;
    selected = -1;
    solved = false;
    notesMode = false;

    ui.setStat("diff", diffLabel(diffId));
    ui.setStat("time", "0:00");
    ui.setStat("miss", "0");
    relabelPad();
    buildGrid();
    renderCages();
    renderAll();
    updatePad();
    closeOverlay();
    startTimer();
    saveState();
  }, 40);
}

/* ===================== save (versioned, shared store) ===================== */
interface SaveData {
  diffId: string;
  board: number[];
  given: boolean[];
  solution: number[];
  cageOf: number[];
  cages: Cage[];
  notes: number[][];
  mistakes: number;
  seconds: number;
  solved: boolean;
}

const store = MG.storage<SaveData>("killer-sudoku", { version: 1 });
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}

function saveState(): void {
  if (!board.length) return;
  store.save({
    diffId: diffId,
    board: board,
    given: given,
    solution: solution,
    cageOf: cageOf,
    cages: cages,
    notes: notes,
    mistakes: mistakes,
    seconds: seconds,
    solved: solved,
  });
}

function loadState(): boolean {
  const st = store.load();
  try {
    if (!st || !st.board || st.board.length !== 81) return false;
    if (!st.cages || !st.cageOf || st.cageOf.length !== 81) return false;
    diffId = st.diffId || "easy";
    board = st.board.slice();
    given = st.given.slice();
    solution = st.solution.slice();
    cageOf = st.cageOf.slice();
    cages = st.cages;
    notes = st.notes && st.notes.length === 81 ? st.notes : board.map(() => []);
    mistakes = st.mistakes || 0;
    seconds = st.seconds || 0;
    solved = !!st.solved;
    return true;
  } catch (_e) {
    return false;
  }
}

/* ============================ start ============================ */
// Re-localize header/pad and dynamic stat values on language change.
MG.i18n.onChange(() => {
  relabelPad();
  if (board.length) ui.setStat("diff", diffLabel(diffId));
  if ($("overlay").classList.contains("show")) {
    // Rebuild whichever panel is open so its text follows the language.
    if (document.getElementById("againBtn")) showWin();
    else if ($("panel").querySelector(".spin")) showBuilding();
    else openChooser();
  }
});

window.addEventListener("pagehide", saveState);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    saveState();
    stopTimer();
  } else if (board.length && !solved) startTimer();
});

buildGrid();
buildPad();

if (loadState()) {
  ui.setStat("diff", diffLabel(diffId));
  ui.setStat("time", fmtTime(seconds));
  ui.setStat("miss", mistakes);
  renderCages();
  renderAll();
  updatePad();
  if (!solved) startTimer();
  else showWin();
} else {
  openChooser();
}

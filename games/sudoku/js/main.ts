import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "SUDOKU",
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
    givensTag: "givens",
    notes: "✎ Notes",
    erase: "⌫",
    winTitle: "Solved!",
    winSub: "Difficulty %d · time %t · mistakes %m",
    again: "↻ Play again",
    diffNames: { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" },
  },
  ru: {
    title: "СУДОКУ",
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
    givensTag: "подсказок",
    notes: "✎ Заметки",
    erase: "⌫",
    winTitle: "Решено!",
    winSub: "Сложность %d · время %t · ошибки %m",
    again: "↻ Играть снова",
    diffNames: { easy: "Лёгкий", medium: "Средний", hard: "Сложный", expert: "Эксперт" },
  },
  es: {
    title: "SUDOKU",
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
    givensTag: "pistas",
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
  givens: number;
}

// Number of starting clues per difficulty (fewer = harder).
const DIFFS: Diff[] = [
  { id: "easy", givens: 42 },
  { id: "medium", givens: 34 },
  { id: "hard", givens: 28 },
  { id: "expert", givens: 24 },
];

const ui: HeaderUI = MG.mountHeader({
  icon: "🔢",
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

/* ====================== sudoku generation ====================== */
// A puzzle is built from a fully-solved grid, then cells are dug out one
// at a time, keeping the solution unique. `solution` always holds the
// answer so we can grade entries and detect a win.
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

// Can value v go at (r,c) on board b (0 = empty)?
function ok(b: number[], r: number, c: number, v: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (b[r * 9 + i] === v) return false;
    if (b[i * 9 + c] === v) return false;
  }
  const br = r - (r % 3);
  const bc = c - (c % 3);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (b[(br + y) * 9 + bc + x] === v) return false;
    }
  }
  return true;
}

function fill(b: number[], pos: number): boolean {
  if (pos === 81) return true;
  if (b[pos] !== 0) return fill(b, pos + 1);
  const nums = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (let i = 0; i < 9; i++) {
    const v = nums[i];
    const r = (pos / 9) | 0;
    const c = pos % 9;
    if (ok(b, r, c, v)) {
      b[pos] = v;
      if (fill(b, pos + 1)) return true;
      b[pos] = 0;
    }
  }
  return false;
}

// Count solutions, capped at `limit` (we only ever need to know if > 1).
function countSolutions(b: number[], limit: number): number {
  let pos = -1;
  for (let i = 0; i < 81; i++) {
    if (b[i] === 0) {
      pos = i;
      break;
    }
  }
  if (pos === -1) return 1;
  const r = (pos / 9) | 0;
  const c = pos % 9;
  let total = 0;
  for (let v = 1; v <= 9; v++) {
    if (ok(b, r, c, v)) {
      b[pos] = v;
      total += countSolutions(b, limit);
      b[pos] = 0;
      if (total >= limit) return total;
    }
  }
  return total;
}

interface Generated {
  solution: number[];
  puzzle: number[];
}

function generate(givens: number): Generated {
  const sol = new Array<number>(81).fill(0);
  fill(sol, 0);
  const puzzle = sol.slice();
  const order = shuffled(Array.from({ length: 81 }, (_, i) => i));
  let remaining = 81;
  for (let i = 0; i < order.length && remaining > givens; i++) {
    const p = order[i];
    const saved = puzzle[p];
    puzzle[p] = 0;
    if (countSolutions(puzzle.slice(), 2) !== 1) puzzle[p] = saved;
    else remaining--;
  }
  return { solution: sol, puzzle: puzzle };
}

/* ============================ state ============================ */
let board: number[] = []; // current values, 0 = empty
let given: boolean[] = []; // boolean: is this a fixed clue?
let solution: number[] = []; // the answer
let notes: number[][] = []; // array(81) of arrays of pencil marks
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
    ((idx: number) => {
      el.addEventListener("pointerdown", () => {
        select(idx);
      });
    })(i);
    grid.appendChild(el);
    cells.push(el);
  }
}

function renderCell(i: number): void {
  const el = cells[i];
  const v = board[i];
  el.classList.toggle("given", given[i]);
  el.classList.remove("conflict");
  if (v) {
    el.textContent = String(v);
    if (!given[i] && hasConflict(i)) el.classList.add("conflict");
  } else {
    el.textContent = "";
    if (notes[i] && notes[i].length) {
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
}

function renderAll(): void {
  for (let i = 0; i < 81; i++) renderCell(i);
  paintSelection();
}

// Does the value at i clash with another value in its row/col/box?
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
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const p = (br + y) * 9 + bc + x;
      if (p !== i && board[p] === v) return true;
    }
  }
  return false;
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
  const sbr = sr - (((sr % 3) + 3) % 3);
  const sbc = sc - (((sc % 3) + 3) % 3);
  for (let i = 0; i < 81; i++) {
    const el = cells[i];
    const r = (i / 9) | 0;
    const c = i % 9;
    el.classList.remove("sel", "peer", "same");
    if (selected < 0) continue;
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

// When a correct number is placed, remove that pencil mark from peers.
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
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) strip((br + y) * 9 + bc + x);
  }
}

function afterChange(_i: number): void {
  // Conflicts can change for the whole row/col/box, so repaint broadly.
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
    ((v: number) => {
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
  // 10th slot in the 5-wide grid sits next to the digits row.
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
  const nb = $("notesToggle");
  const eb = $("eraseBtn");
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

function openChooser(): void {
  stopTimer();
  let html = `<h2>${MG.i18n.t("chooseTitle")}</h2><p>${MG.i18n.t("chooseSub")}</p><div class="diffs">`;
  DIFFS.forEach((d) => {
    html += `<button class="diff" data-id="${d.id}"><span>${diffLabel(
      d.id,
    )}</span><span class="tag">${d.givens} ${MG.i18n.t("givensTag")}</span></button>`;
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

function showWin(): void {
  const sub = MG.i18n
    .t("winSub")
    .replace("%d", diffLabel(diffId))
    .replace("%t", fmtTime(seconds))
    .replace("%m", String(mistakes));
  $("panel").innerHTML =
    `<div class="win-emoji">🎉</div><h2>${MG.i18n.t("winTitle")}</h2><p>${sub}</p>` +
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
  const g = generate(d.givens);
  solution = g.solution;
  board = g.puzzle.slice();
  given = g.puzzle.map((v) => v !== 0);
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
  renderAll();
  updatePad();
  closeOverlay();
  startTimer();
  saveState();
}

/* ===================== save (versioned, shared store) ===================== */
interface SudokuSave {
  diffId: string;
  board: number[];
  given: boolean[];
  solution: number[];
  notes: number[][];
  mistakes: number;
  seconds: number;
  solved: boolean;
}

const store = MG.storage<SudokuSave>("sudoku", { version: 1 });
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
    diffId = st.diffId || "easy";
    board = st.board.slice();
    given = st.given.slice();
    solution = st.solution.slice();
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
  renderAll();
  updatePad();
  if (!solved) startTimer();
  else showWin();
} else {
  openChooser();
}

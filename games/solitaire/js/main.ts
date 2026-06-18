import { cards } from "../../../shared/cards";
import { MG } from "../../../shared/mg";
import type { Card } from "../../../shared/types";

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const C = cards;

/* ============================ types =========================== */
// A pile entry is { c: cardRecord, up: bool }.
interface Entry {
  c: Card;
  up: boolean;
}

interface Game {
  seed: number;
  drawCount: number;
  stock: Entry[];
  waste: Entry[];
  foundations: Entry[][];
  tableau: Entry[][];
  moves: number;
}

type Src = { type: "waste" } | { type: "foundation"; f: number } | { type: "tableau"; p: number };

type Dest = { type: "foundation"; f: number } | { type: "tableau"; p: number };

interface Serialized {
  seed: number;
  drawCount: number;
  moves: number;
  stock: string[];
  waste: string[];
  foundations: string[][];
  tableau: string[][];
  elapsed?: number;
}

interface DragState {
  src: Src;
  entries: Entry[];
  startX: number;
  startY: number;
  offX: number;
  offY: number;
  started: boolean;
  layer: HTMLElement | null;
  sources: HTMLElement[];
  pointerId: number;
  captureEl: HTMLElement;
}

interface Metrics {
  cardW: number;
  cardH: number;
  downOff: number;
  upOff: number;
}

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "Solitaire",
    moves: "Moves",
    time: "Time",
    newGame: "New",
    undo: "Undo",
    draw1: "Draw 1",
    draw3: "Draw 3",
    win: "You win!",
    winSub: "Cleared in {m} moves · {t}",
    playAgain: "Play again",
    stockHint: "↺",
  },
  ru: {
    title: "Пасьянс",
    moves: "Ходы",
    time: "Время",
    newGame: "Новая",
    undo: "Отмена",
    draw1: "Тянуть 1",
    draw3: "Тянуть 3",
    win: "Победа!",
    winSub: "Собрано за {m} ходов · {t}",
    playAgain: "Ещё раз",
    stockHint: "↺",
  },
  es: {
    title: "Solitario",
    moves: "Mov.",
    time: "Tiempo",
    newGame: "Nuevo",
    undo: "Deshacer",
    draw1: "Roba 1",
    draw3: "Roba 3",
    win: "¡Ganaste!",
    winSub: "Resuelto en {m} movimientos · {t}",
    playAgain: "Jugar otra vez",
    stockHint: "↺",
  },
});

const t = MG.i18n.t;

// Versioned save: in-progress game + draw preference.
const store = MG.storage<Serialized>("solitaire", { version: 1 });

/* ============================ state =========================== */
// A pile entry is { c: cardRecord, up: bool }.
let game: Game = null as unknown as Game; // see newGame()
let undoStack: string[] = [];
let elapsed = 0; // seconds
let timer: number | null = null;
let running = false; // a game is in progress (timer counts)
let autoBusy = false; // auto-finish animation running
let won = false;

// id -> card record, to rebuild piles from a saved/serialized game.
const CARD_BY_ID: Record<string, Card> = {};
C.makeDeck().forEach((c) => {
  CARD_BY_ID[c.id] = c;
});

/* ----- header ----- */
const ui = MG.mountHeader({
  icon: "🃏",
  titleKey: "title",
  stats: [
    { key: "moves", labelKey: "moves" },
    { key: "time", labelKey: "time", variant: "sm", value: "0:00" },
  ],
  actions: [
    { key: "draw", labelKey: "draw1", onClick: toggleDraw },
    { key: "undo", labelKey: "undo", onClick: undo },
    {
      key: "new",
      labelKey: "newGame",
      onClick: () => {
        newGame();
      },
    },
  ],
});

function setDrawLabel(): void {
  const btn = ui.action("draw");
  if (btn) btn.textContent = t(game && game.drawCount === 3 ? "draw3" : "draw1");
}

/* ========================= deal / rules ======================= */
function newGame(drawCount?: number): void {
  const dc = drawCount || (game && game.drawCount) || 1;
  const deal = C.dealDeck();
  const deck = deal.cards;

  const tableau: Entry[][] = [[], [], [], [], [], [], []];
  let k = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      tableau[col].push({ c: deck[k++], up: row === col });
    }
  }
  const stock: Entry[] = [];
  while (k < deck.length) stock.push({ c: deck[k++], up: false });

  game = {
    seed: deal.seed,
    drawCount: dc,
    stock: stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau: tableau,
    moves: 0,
  };
  undoStack = [];
  elapsed = 0;
  won = false;
  autoBusy = false;
  running = false; // starts on first move
  hideOverlay();
  setDrawLabel();
  ui.setStat("moves", 0);
  updateTime();
  layout();
  render(true);
  persist();
}

function toggleDraw(): void {
  newGame(game && game.drawCount === 3 ? 1 : 3);
}

// Can `card` be placed on a tableau pile (by its top entry)?
function fitsTableau(card: Card, pile: Entry[]): boolean {
  if (!pile.length) return card.rank === 13; // empty: King only
  const top = pile[pile.length - 1];
  if (!top.up) return false;
  return top.c.color !== card.color && card.rank === top.c.rank - 1;
}

// Can `card` go onto foundation pile `f`?
function fitsFoundation(card: Card, pile: Entry[]): boolean {
  if (!pile.length) return card.rank === 1; // empty: Ace only
  const top = pile[pile.length - 1].c;
  return top.suit === card.suit && card.rank === top.rank + 1;
}

/* --------------------------- moves --------------------------- */
function snapshot(): string {
  return JSON.stringify(serialize(false));
}

function pushUndo(): void {
  undoStack.push(snapshot());
  if (undoStack.length > 300) undoStack.shift();
  const btn = ui.action("undo");
  if (btn) btn.disabled = false;
}

function startIfNeeded(): void {
  if (running || won) return;
  running = true;
  if (!timer) timer = window.setInterval(tick, 1000);
}

function bumpMove(): void {
  game.moves++;
  ui.setStat("moves", game.moves);
}

// Deal from stock to waste, or recycle the waste back into the stock.
function drawStock(): void {
  if (autoBusy || won) return;
  if (!game.stock.length && !game.waste.length) return;
  pushUndo();
  if (!game.stock.length) {
    // Recycle: waste back to stock, face down, original order.
    while (game.waste.length) {
      const e = game.waste.pop() as Entry;
      e.up = false;
      game.stock.push(e);
    }
  } else {
    const n = Math.min(game.drawCount, game.stock.length);
    for (let i = 0; i < n; i++) {
      const d = game.stock.pop() as Entry;
      d.up = true;
      game.waste.push(d);
    }
  }
  startIfNeeded();
  bumpMove();
  render();
  persist();
}

// Apply a validated move of `entries` from `src` to a destination.
// src: {type:'waste'} | {type:'foundation', f} | {type:'tableau', p}
// dest: {type:'foundation', f} | {type:'tableau', p}
function applyMove(entries: Entry[], src: Src, dest: Dest): void {
  pushUndo();

  // Remove from source.
  if (src.type === "waste") {
    game.waste.pop();
  } else if (src.type === "foundation") {
    game.foundations[src.f].pop();
  } else {
    game.tableau[src.p].splice(game.tableau[src.p].length - entries.length);
  }

  // Add to destination.
  if (dest.type === "foundation") {
    entries.forEach((e) => {
      e.up = true;
      game.foundations[dest.f].push(e);
    });
  } else {
    entries.forEach((e) => {
      e.up = true;
      game.tableau[dest.p].push(e);
    });
  }

  // Flip the newly exposed tableau card, if any.
  if (src.type === "tableau") {
    const pile = game.tableau[src.p];
    if (pile.length && !pile[pile.length - 1].up) pile[pile.length - 1].up = true;
  }

  startIfNeeded();
  bumpMove();
  render();
  persist();
  checkWin();
  maybeAutoFinish();
}

// Try to send a single card to any foundation. Returns true if moved.
function sendToFoundation(card: Card, src: Src): boolean {
  for (let f = 0; f < 4; f++) {
    if (fitsFoundation(card, game.foundations[f])) {
      applyMove([{ c: card, up: true }], src, { type: "foundation", f: f });
      return true;
    }
  }
  return false;
}

// Tap on a face-up top card: auto-send to a foundation if it fits.
function tapCard(src: Src): void {
  if (autoBusy || won) return;
  const card = topCardOf(src);
  if (!card) return;
  sendToFoundation(card, src);
}

function topCardOf(src: Src): Card | null {
  if (src.type === "waste") {
    return game.waste.length ? game.waste[game.waste.length - 1].c : null;
  }
  if (src.type === "foundation") {
    const fp = game.foundations[src.f];
    return fp.length ? fp[fp.length - 1].c : null;
  }
  const tp = game.tableau[src.p];
  return tp.length ? tp[tp.length - 1].c : null;
}

function undo(): void {
  if (autoBusy || !undoStack.length) return;
  const snap = undoStack.pop() as string;
  deserialize(JSON.parse(snap), false);
  won = false;
  hideOverlay();
  ui.setStat("moves", game.moves);
  const btn = ui.action("undo");
  if (btn) btn.disabled = !undoStack.length;
  render();
  persist();
}

/* ----------------------- auto finish ------------------------- */
function noFaceDown(): boolean {
  for (let p = 0; p < 7; p++) {
    const pile = game.tableau[p];
    for (let i = 0; i < pile.length; i++) if (!pile[i].up) return false;
  }
  return true;
}

// Once every card is exposed and the stock is empty, the game is solved:
// greedily send tops to the foundations until the board clears.
function maybeAutoFinish(): void {
  if (autoBusy || won) return;
  if (game.stock.length || !noFaceDown()) return;
  autoBusy = true;
  const step = (): void => {
    if (won) {
      autoBusy = false;
      return;
    }
    if (autoStep()) {
      window.setTimeout(step, 140);
    } else {
      autoBusy = false;
    }
  };
  window.setTimeout(step, 160);
}

function autoStep(): boolean {
  // Waste top first, then each tableau top.
  if (game.waste.length && sendToFoundation(game.waste[game.waste.length - 1].c, { type: "waste" }))
    return true;
  for (let p = 0; p < 7; p++) {
    const pile = game.tableau[p];
    if (pile.length && sendToFoundation(pile[pile.length - 1].c, { type: "tableau", p: p }))
      return true;
  }
  return false;
}

/* ----------------------------- win --------------------------- */
function checkWin(): void {
  let total = 0;
  for (let f = 0; f < 4; f++) total += game.foundations[f].length;
  if (total === 52 && !won) {
    won = true;
    running = false;
    autoBusy = false;
    showWin();
    store.clear(); // fresh game next visit
  }
}

function showWin(): void {
  $("ov-msg").textContent = t("win");
  $("ov-sub").textContent = t("winSub")
    .replace("{m}", String(game.moves))
    .replace("{t}", fmtTime(elapsed));
  const b = $("ov-btn");
  b.textContent = t("playAgain");
  $("overlay").classList.remove("hidden");
}

function hideOverlay(): void {
  $("overlay").classList.add("hidden");
}

/* ============================ timer =========================== */
function tick(): void {
  if (!running || won) return;
  elapsed++;
  updateTime();
  if (elapsed % 5 === 0) persist();
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m + ":" + (ss < 10 ? "0" + ss : ss);
}

function updateTime(): void {
  ui.setStat("time", fmtTime(elapsed));
}

/* ============================ render ========================== */
const metrics: Metrics = { cardW: 0, cardH: 0, downOff: 0, upOff: 0 };

function layout(): void {
  const stock = $("stock");
  const w = stock.clientWidth || 60;
  const h = (w * 7) / 5;
  metrics.cardW = w;
  metrics.cardH = h;
  metrics.downOff = Math.round(h * 0.16);
  metrics.upOff = Math.round(h * 0.3);
  $("board").style.setProperty("--cardh", h + "px");
}

function makeCardEl(entry: Entry, dealt: boolean): HTMLElement {
  const pos = MG.el("div", "card-pos" + (dealt ? " dealt" : ""));
  pos.appendChild(C.renderCard(entry.c, entry.up));
  return pos;
}

// Clear a zone's cards (keep its ::after placeholder via class toggles).
function clearZone(node: HTMLElement): void {
  const kids = node.querySelectorAll(".card-pos");
  for (let i = kids.length - 1; i >= 0; i--) node.removeChild(kids[i]);
}

function setEmpty(node: HTMLElement, empty: boolean, hint: string | null): void {
  node.classList.toggle("empty", empty);
  if (hint != null) node.setAttribute("data-hint", hint);
  else node.removeAttribute("data-hint");
}

function render(dealt?: boolean): void {
  // --- Stock ---
  const stock = $("stock");
  clearZone(stock);
  setEmpty(stock, game.stock.length === 0, t("stockHint"));
  if (game.stock.length) {
    const back = makeCardEl({ c: game.stock[game.stock.length - 1].c, up: false }, false);
    stock.appendChild(back);
  }
  stock.onclick = drawStock;

  // --- Waste (fan up to 3, only the top is draggable) ---
  const waste = $("waste");
  clearZone(waste);
  setEmpty(waste, game.waste.length === 0, "");
  const ws = game.waste;
  const show = Math.min(3, ws.length);
  const fan = Math.round(metrics.cardW * 0.28);
  for (let wi = 0; wi < show; wi++) {
    const idx = ws.length - show + wi;
    const wEntry = ws[idx];
    const wEl = makeCardEl(wEntry, Boolean(dealt) && idx === ws.length - 1);
    wEl.style.left = wi * fan + "px";
    if (idx === ws.length - 1) {
      bindDrag(wEl, { type: "waste" }, [wEntry]);
    }
    waste.appendChild(wEl);
  }

  // --- Foundations ---
  for (let f = 0; f < 4; f++) {
    const fNode = document.querySelector('.found[data-f="' + f + '"]') as HTMLElement;
    clearZone(fNode);
    const fp = game.foundations[f];
    setEmpty(fNode, fp.length === 0, "A");
    if (fp.length) {
      const fTop = fp[fp.length - 1];
      const fEl = makeCardEl(fTop, false);
      bindDrag(fEl, { type: "foundation", f: f }, [fTop]);
      fNode.appendChild(fEl);
    }
  }

  // --- Tableau ---
  for (let p = 0; p < 7; p++) {
    const pNode = document.querySelector('.pile[data-p="' + p + '"]') as HTMLElement;
    clearZone(pNode);
    const pile = game.tableau[p];
    setEmpty(pNode, pile.length === 0, "K");
    let top = 0;
    for (let ci = 0; ci < pile.length; ci++) {
      const entry = pile[ci];
      const cEl = makeCardEl(entry, Boolean(dealt) && entry.up);
      cEl.style.top = top + "px";
      if (entry.up) {
        bindDrag(cEl, { type: "tableau", p: p }, pile.slice(ci));
      }
      pNode.appendChild(cEl);
      top += entry.up ? metrics.upOff : metrics.downOff;
    }
    pNode.style.height = Math.max(metrics.cardH, top + metrics.cardH) + "px";
  }
}

// The tableau host is built once; fill it with 7 piles.
function buildTableau(): void {
  const host = $("tableau");
  host.innerHTML = "";
  for (let p = 0; p < 7; p++) {
    const pile = MG.el("div", "pile");
    pile.setAttribute("data-p", String(p));
    host.appendChild(pile);
  }
}

/* =========================== drag ============================ */
let drag: DragState | null = null;

function bindDrag(el: HTMLElement, src: Src, entries: Entry[]): void {
  el.addEventListener("pointerdown", (e) => {
    if (autoBusy || won) return;
    if (e.button != null && e.button !== 0) return;
    startDrag(e, el, src, entries);
  });
}

function startDrag(e: PointerEvent, el: HTMLElement, src: Src, entries: Entry[]): void {
  const rect = el.getBoundingClientRect();
  drag = {
    src: src,
    entries: entries,
    startX: e.clientX,
    startY: e.clientY,
    offX: e.clientX - rect.left,
    offY: e.clientY - rect.top,
    started: false,
    layer: null,
    sources: [],
    pointerId: e.pointerId,
    captureEl: el,
  };
  try {
    el.setPointerCapture(e.pointerId);
  } catch (_err) {
    /* ignore */
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

function beginVisualDrag(): void {
  if (!drag) return;
  const layer = MG.el("div", "drag-layer");
  layer.style.width = metrics.cardW + "px";
  // Find the DOM elements for the dragged entries (top of their pile) and
  // hide them; clone faces into the floating layer.
  const srcNode = zoneNode(drag.src);
  const posEls = srcNode.querySelectorAll(".card-pos");
  const first = posEls.length - drag.entries.length;
  for (let i = 0; i < drag.entries.length; i++) {
    const orig = posEls[first + i] as HTMLElement | undefined;
    if (orig) {
      orig.classList.add("dragging");
      drag.sources.push(orig);
    }
    const clone = makeCardEl(drag.entries[i], false);
    clone.style.top = i * metrics.upOff + "px";
    layer.appendChild(clone);
  }
  document.body.appendChild(layer);
  drag.layer = layer;
  moveLayer(drag.startX, drag.startY);
}

function moveLayer(x: number, y: number): void {
  if (!drag || !drag.layer) return;
  drag.layer.style.transform = "translate(" + (x - drag.offX) + "px," + (y - drag.offY) + "px)";
}

function onMove(e: PointerEvent): void {
  if (!drag) return;
  if (!drag.started) {
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (dx * dx + dy * dy < 36) return; // < 6px: still a tap
    drag.started = true;
    beginVisualDrag();
  }
  moveLayer(e.clientX, e.clientY);
  e.preventDefault();
}

function onUp(e: PointerEvent): void {
  if (!drag) return;
  const d = drag;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("pointercancel", onUp);
  try {
    d.captureEl.releasePointerCapture(d.pointerId);
  } catch (_err) {
    /* ignore */
  }

  if (!d.started) {
    drag = null;
    tapCard(d.src);
    return;
  }

  // Drop point = center of the dragged card's head.
  const px = e.clientX - d.offX + metrics.cardW / 2;
  const py = e.clientY - d.offY + metrics.cardH / 2;
  const dest = findDrop(px, py, d.entries);

  if (d.layer && d.layer.parentNode) d.layer.parentNode.removeChild(d.layer);
  drag = null;

  if (dest) {
    applyMove(d.entries, d.src, dest);
  } else {
    render(); // snap back
  }
}

function zoneNode(src: Src): HTMLElement {
  if (src.type === "waste") return $("waste");
  if (src.type === "foundation")
    return document.querySelector('.found[data-f="' + src.f + '"]') as HTMLElement;
  return document.querySelector('.pile[data-p="' + src.p + '"]') as HTMLElement;
}

// Choose the closest valid drop zone whose rect contains the point.
function findDrop(px: number, py: number, entries: Entry[]): Dest | null {
  const card = entries[0].c;
  let best: Dest | null = null;
  let bestD = Infinity;

  function consider(node: HTMLElement, dest: Dest, ok: boolean): void {
    if (!ok) return;
    const r = node.getBoundingClientRect();
    if (px < r.left - 8 || px > r.right + 8 || py < r.top - 8 || py > r.bottom + 8) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dd = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (dd < bestD) {
      bestD = dd;
      best = dest;
    }
  }

  // Foundations only take a single card.
  if (entries.length === 1) {
    for (let f = 0; f < 4; f++) {
      consider(
        document.querySelector('.found[data-f="' + f + '"]') as HTMLElement,
        { type: "foundation", f: f },
        fitsFoundation(card, game.foundations[f]),
      );
    }
  }
  for (let p = 0; p < 7; p++) {
    consider(
      document.querySelector('.pile[data-p="' + p + '"]') as HTMLElement,
      { type: "tableau", p: p },
      fitsTableau(card, game.tableau[p]),
    );
  }
  return best;
}

/* ========================= serialize ========================= */
function serialize(withMeta: boolean): Serialized {
  const s: Serialized = {
    seed: game.seed,
    drawCount: game.drawCount,
    moves: game.moves,
    stock: game.stock.map((e) => e.c.id),
    waste: game.waste.map((e) => e.c.id),
    foundations: game.foundations.map((pile) => pile.map((e) => e.c.id)),
    tableau: game.tableau.map((pile) => pile.map((e) => e.c.id + (e.up ? "1" : "0"))),
  };
  if (withMeta) s.elapsed = elapsed;
  return s;
}

function deserialize(s: Serialized, withMeta: boolean): void {
  const up = (id: string): Entry => ({ c: CARD_BY_ID[id], up: false });
  game = {
    seed: s.seed,
    drawCount: s.drawCount || 1,
    moves: s.moves || 0,
    stock: s.stock.map(up),
    waste: s.waste.map((id) => ({ c: CARD_BY_ID[id], up: true })),
    foundations: s.foundations.map((pile) => pile.map((id) => ({ c: CARD_BY_ID[id], up: true }))),
    tableau: s.tableau.map((pile) =>
      pile.map((code) => {
        const flag = code.charAt(code.length - 1);
        const id = code.slice(0, -1);
        return { c: CARD_BY_ID[id], up: flag === "1" };
      }),
    ),
  };
  if (withMeta && typeof s.elapsed === "number") elapsed = s.elapsed;
}

function persist(): void {
  if (won) return;
  store.save(serialize(true));
}

/* ============================ boot =========================== */
buildTableau();

$("ov-btn").addEventListener("click", () => {
  newGame();
});

// Re-localize live strings on language change.
MG.i18n.onChange(() => {
  setDrawLabel();
  if (game) {
    setEmpty($("stock"), game.stock.length === 0, t("stockHint"));
    if (won) showWin();
  }
});

// Re-measure and re-render on resize (debounced).
let resizeT: number | null = null;
window.addEventListener("resize", () => {
  if (resizeT) window.clearTimeout(resizeT);
  resizeT = window.setTimeout(() => {
    if (!game) return;
    layout();
    render();
  }, 120);
});

// Resume a saved game, else deal a fresh one.
const saved = store.load();
if (saved && saved.tableau) {
  deserialize(saved, true);
  won = false;
  setDrawLabel();
  ui.setStat("moves", game.moves);
  updateTime();
  const ub = ui.action("undo");
  if (ub) ub.disabled = true;
  layout();
  render();
  // Resume the clock only if the player had already moved.
  if (game.moves > 0) startIfNeeded();
} else {
  newGame();
  const ub2 = ui.action("undo");
  if (ub2) ub2.disabled = true;
}

/* ============================================================================
 *  Asteroid Colony — DOM chrome: header, HUD bars, toolbar, info panel,
 *  toast and the start / game-over overlay. The canvas world is drawn in
 *  render.ts; everything here is plain DOM so it re-localises for free.
 * ========================================================================== */
import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";
import {
  BUILD_BY_ID,
  BUILDINGS,
  colOf,
  costEntries,
  N,
  O2_TARGET,
  rowOf,
  SPACE_ROWS,
} from "./config";
import { T } from "./i18n";
import { removeBuilding } from "./input";
import { livingDupes, reset, state } from "./state";
import type { BuildingId, ToolId, ViewMode } from "./types";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const MAT_ICON: Record<string, string> = {
  dirt: "🟫",
  rock: "🪨",
  algae: "🟩",
  ore: "🟧",
  water: "💧",
  coal: "⚫",
};

const TOOLS: { id: ToolId; ico: string; key: string }[] = [
  { id: "dig", ico: "⛏️", key: "toolDig" },
  { id: "build", ico: "🏗️", key: "toolBuild" },
  { id: "cancel", ico: "🚫", key: "toolCancel" },
];
const VIEW_ORDER: ViewMode[] = ["normal", "oxygen", "heat"];

let ui: HeaderUI;
let hud: HTMLElement;
let toolbar: HTMLElement;
let overlay: HTMLElement;
let panel: HTMLElement;
let toastEl: HTMLElement;
let toastTimer = 0;
let onStartCb: () => void = () => {};

function h(tag: string, cls?: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function initView(opts: { onStart: () => void }): void {
  onStartCb = opts.onStart;
  ui = MG.mountHeader({
    icon: "🛰️",
    titleKey: "title",
    stats: [
      { key: "cycle", labelKey: "cycle", value: 1 },
      { key: "dupes", labelKey: "dupes", value: 1 },
      { key: "o2", labelKey: "o2", variant: "alert", value: "100%" },
    ],
    actions: [
      {
        key: "new",
        labelKey: "newColony",
        onClick: () => {
          if (window.confirm(T("confirmReset"))) {
            reset();
            syncStats();
            buildToolbar();
            closeInfo();
          }
        },
      },
    ],
  });

  hud = $("hud");
  toolbar = $("toolbar");
  overlay = $("overlay");
  panel = $("panel");
  toastEl = $("toast");

  buildHud();
  buildToolbar();

  MG.i18n.onChange(() => {
    syncStats();
    buildToolbar();
    if (!overlay.classList.contains("hidden")) refreshOverlay();
    if (state.selCell != null) openInfo(state.selCell);
  });
}

// --- HUD -------------------------------------------------------------------
const HUD_BARS = [
  { key: "o2", labelKey: "hudO2", color: "var(--mg-accent)" },
  { key: "food", labelKey: "hudFood", color: "#7bd88f" },
  { key: "power", labelKey: "hudPower", color: "var(--mg-warn)" },
  { key: "temp", labelKey: "hudTemp", color: "#ff7b54" },
];

function buildHud(): void {
  hud.innerHTML = "";
  for (const b of HUD_BARS) {
    const wrap = h("div", "hud-item");
    wrap.innerHTML =
      `<span class="hud-label">${T(b.labelKey)}</span>` +
      `<span class="hud-bar"><i id="bar-${b.key}" style="background:${b.color}"></i></span>` +
      `<span class="hud-val" id="val-${b.key}">—</span>`;
    hud.appendChild(wrap);
  }
}

function colonyAverages(): { o2: number; temp: number } {
  let o2 = 0;
  let temp = 0;
  let open = 0;
  for (let i = 0; i < N; i++) {
    if (rowOf(i) < SPACE_ROWS) continue;
    const t = state.grid[i];
    if (t.solid !== null) continue;
    o2 += t.o2;
    temp += t.temp;
    open++;
  }
  if (!open) return { o2: 0, temp: 0 };
  return { o2: o2 / open, temp: temp / open };
}

export function syncStats(): void {
  const avg = colonyAverages();
  const o2Pct = Math.round(Math.min(1, avg.o2 / O2_TARGET) * 100);
  ui.setStat("cycle", state.cycle);
  ui.setStat("dupes", livingDupes());
  ui.setStat("o2", `${o2Pct}%`);

  setBar("o2", Math.min(1, avg.o2 / O2_TARGET), `${o2Pct}%`);
  setBar("food", state.foodCap ? state.food / state.foodCap : 0, `${Math.round(state.food)}`);
  // Power bar: scaled around ±60W, centred at "balanced".
  const pw = state.power;
  setBar("power", Math.min(1, Math.max(0, (pw + 60) / 120)), `${pw > 0 ? "+" : ""}${pw}W`);
  setBar("temp", Math.min(1, Math.max(0, (avg.temp + 20) / 100)), `${Math.round(avg.temp)}°`);
}

function setBar(key: string, frac: number, val: string): void {
  const bar = document.getElementById(`bar-${key}`);
  const v = document.getElementById(`val-${key}`);
  if (bar) bar.style.width = `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`;
  if (v) v.textContent = val;
}

// --- toolbar ---------------------------------------------------------------
export function buildToolbar(): void {
  toolbar.innerHTML = "";

  const tools = h("div", "tool-row");
  for (const tl of TOOLS) {
    const b = h("button", `tool-btn${state.tool === tl.id ? " active" : ""}`);
    b.innerHTML = `<span class="t-ico">${tl.ico}</span><span class="t-lbl">${T(tl.key)}</span>`;
    b.addEventListener("click", () => {
      state.tool = tl.id;
      buildToolbar();
    });
    tools.appendChild(b);
  }
  const vb = h("button", "tool-btn view-btn");
  vb.innerHTML = `<span class="t-ico">👁️</span><span class="t-lbl">${T(`view${cap(state.view)}`)}</span>`;
  vb.addEventListener("click", () => {
    const next = VIEW_ORDER[(VIEW_ORDER.indexOf(state.view) + 1) % VIEW_ORDER.length];
    state.view = next;
    buildToolbar();
  });
  tools.appendChild(vb);
  toolbar.appendChild(tools);

  if (state.tool === "build") {
    const chips = h("div", "chip-row");
    for (const def of BUILDINGS) {
      const chip = h("button", `chip${state.buildSel === def.id ? " sel" : ""}`);
      const cost = costEntries(def.id)
        .map(([m, n]) => `${MAT_ICON[m] || ""}${n}`)
        .join(" ");
      chip.innerHTML = `<span class="chip-ico">${def.ico}</span><span class="chip-cost">${cost}</span>`;
      chip.title = T(`b_${def.id}`);
      chip.addEventListener("click", () => {
        state.buildSel = def.id;
        state.tool = "build";
        buildToolbar();
      });
      chips.appendChild(chip);
    }
    toolbar.appendChild(chips);
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- building info panel ---------------------------------------------------
export function openInfo(i: number): void {
  const t = state.grid[i];
  const id = (t.build || t.blueprint) as BuildingId | null;
  if (!id) {
    closeInfo();
    return;
  }
  state.selCell = i;
  const def = BUILD_BY_ID[id];
  const status = t.build ? (t.on ? T("infoActive") : T("infoIdle")) : T("infoBlueprint");
  const cost = costEntries(id)
    .map(([m, n]) => `${MAT_ICON[m] || ""}${n}`)
    .join("  ");
  panel.className = "panel info";
  panel.innerHTML =
    `<div class="info-head"><span class="info-ico">${def.ico}</span>` +
    `<span class="info-name">${T(`b_${id}`)}</span></div>` +
    `<div class="info-desc">${T(`b_${id}_d`)}</div>` +
    `<div class="info-status">${status}</div>` +
    `<div class="info-cost">${T("cost")}: ${cost}</div>` +
    `<div class="info-actions">` +
    `<button class="pill danger" id="info-remove">${T("remove")}</button>` +
    `<button class="pill" id="info-close">${T("close")}</button>` +
    "</div>";
  overlay.classList.remove("hidden");
  overlay.classList.add("info-mode");
  $("info-remove").addEventListener("click", () => {
    removeBuilding(i);
    closeInfo();
    syncStats();
  });
  $("info-close").addEventListener("click", closeInfo);
}

export function closeInfo(): void {
  state.selCell = null;
  overlay.classList.add("hidden");
  overlay.classList.remove("info-mode");
}

// --- toast -----------------------------------------------------------------
export function toast(key: string): void {
  toastEl.textContent = T(key);
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1600);
}

// --- start / game-over overlay --------------------------------------------
let overlayMode: "start" | "gameover" | null = null;

export function showStart(): void {
  overlayMode = "start";
  refreshOverlay();
}
export function showGameOver(): void {
  overlayMode = "gameover";
  refreshOverlay();
}
export function hideOverlay(): void {
  overlayMode = null;
  overlay.classList.add("hidden");
  overlay.classList.remove("info-mode");
}

function refreshOverlay(): void {
  if (!overlayMode) return;
  panel.className = "panel";
  if (overlayMode === "start") {
    panel.innerHTML =
      `<div class="ov-title">🛰️ ${T("title")}</div>` +
      `<div class="ov-hint">${T("startHint")}</div>` +
      (state.best > 0 ? `<div class="ov-line">★ ${T("best")}: ${state.best}</div>` : "") +
      `<button class="pill big" id="ov-act">${T("start")}</button>`;
  } else {
    panel.innerHTML =
      `<div class="ov-title">💀 ${T("gameOver")}</div>` +
      `<div class="ov-line">${T("survived")} <b>${state.cycle}</b> ${T("cyclesLabel")}</div>` +
      (state.best > 0 ? `<div class="ov-line">★ ${T("best")}: ${state.best}</div>` : "") +
      `<button class="pill big" id="ov-act">${T("playAgain")}</button>`;
  }
  overlay.classList.remove("hidden", "info-mode");
  $("ov-act").addEventListener("click", () => {
    hideOverlay();
    onStartCb();
  });
}

void colOf;

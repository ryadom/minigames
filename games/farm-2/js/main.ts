import { MG } from "../../../shared/mg";
import {
  ANIMALS,
  BUILDINGS,
  type Crop,
  ITEMS,
  type Item,
  type Kind,
  type Recipe,
  type Species,
} from "./data";
import { icon, name, t } from "./i18n";
import {
  type Action,
  advance,
  apply,
  type Entity,
  entityAt,
  type Farm,
  fits,
  level,
  newFarm,
  progress,
  restore,
} from "./model";
import { goalCard, type Mode, money, panel, type View } from "./panels";
import { World } from "./world";

// Own the entire shell: an old cached HTML page can still boot this new entrypoint.
document.body.className = "mg-app valley-app";
document.body.innerHTML = `<main class="mg-game-area workspace" id="workspace">
  <aside class="sidebar" id="sidebar"><div class="valley-brand"><span class="brand-mark">${icon("sprout")}</span><div><small id="edition"></small><h1 id="brand"></h1></div></div><nav class="workspace-nav" id="tabs"></nav><div class="panel-scroll" id="panel"></div><footer class="save-note" id="saveNote"></footer><button class="mobile-close" data-action="close-panel" aria-label="${t("close")}">${icon("close")}</button></aside>
  <section class="stage" id="stage"><canvas id="farmCanvas" tabindex="0" role="application"></canvas><div id="pins" class="map-pins"></div>
    <div class="world-heading"><span class="eyebrow"><i></i> FARM / 02</span><h2 id="homestead"></h2><p id="tagline"></p></div>
    <div id="goal" class="goal-card"></div><div class="mode-hint" id="modeHint"></div>
    <div class="zoom-controls" id="zoomControls"></div><div class="placement-bar" id="placement"></div>
    <nav class="tool-dock" id="toolDock"></nav><p class="map-caption" id="mapCaption"></p>
  </section><nav class="mobile-nav" id="mobileNav"></nav>
</main><div class="notice" id="notice" role="status" aria-live="polite"></div>
<dialog id="guide"><div class="guide-icon">${icon("sprout")}</div><h2 id="guideTitle"></h2><p id="guideBody"></p><form method="dialog"><button class="primary" id="guideClose"></button></form></dialog>`;
document.querySelector('link[href*="farm.css"]')?.setAttribute("href", "farm.css?v=valley-1");
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
// A new simulation and layout intentionally start a new valley. Previous editions' saves remain separate.
const store = MG.storage<Farm>("farm-2-valley", { version: 1 });
let farm = restore(store.load());
const view: View = {
  tab: "build",
  category: "grow",
  selected: null,
  mode: "inspect",
  seed: "wheat",
  build: "plot",
  rotated: false,
  mobileOpen: false,
};
const stage = $("stage"),
  world = new World($<HTMLCanvasElement>("farmCanvas"));
let previewPinned = false;
let moving: number | null = null,
  noticeTimer: ReturnType<typeof setTimeout> | undefined;
const header = MG.mountHeader({
  icon: "↗",
  titleKey: "title",
  stats: [
    { key: "coins", labelKey: "coins", value: farm.coins },
    { key: "level", labelKey: "level", value: level(farm) },
  ],
  actions: [
    {
      key: "help",
      labelKey: "help",
      onClick: () => {
        $("guideTitle").textContent = t("welcome");
        $("guideBody").textContent = t("helpBody");
        $("guideClose").textContent = t("close");
        $<HTMLDialogElement>("guide").showModal();
      },
    },
    {
      key: "new",
      labelKey: "reset",
      onClick: () => {
        if (window.confirm(t("confirmReset"))) {
          farm = newFarm();
          cancel();
          view.selected = null;
          world.selected = null;
          save();
          render();
        }
      },
    },
  ],
});
function save(): void {
  store.save(farm);
}
function notify(message: string): void {
  $("notice").textContent = message;
  $("notice").classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $("notice").classList.remove("show"), 2800);
}
function run(action: Action, success?: string): boolean {
  advance(farm);
  const before = level(farm),
    result = apply(farm, action);
  if (!result.ok) {
    notify(t(result.error));
    render();
    return false;
  }
  if (result.id) view.selected = result.id;
  const suffix = result.item
    ? `${ITEMS[result.item].icon} +${result.amount} ${name(ITEMS[result.item].names)}`
    : "";
  notify(
    suffix || success || (result.amount ? `${t("received")} +${result.amount}` : t("received")),
  );
  if (level(farm) > before) notify(`${iconTextStar()} ${t("level")} ${level(farm)}!`);
  save();
  render();
  return true;
}
function iconTextStar(): string {
  return "★";
}
function nav(): string {
  return (
    [
      ["info", "home"],
      ["build", "hammer"],
      ["storage", "box"],
      ["orders", "orders"],
    ] as const
  )
    .map(
      ([id, ico]) =>
        `<button data-action="tab" data-value="${id}" class="${view.tab === id ? "active" : ""}" aria-label="${t(id)}" aria-pressed="${view.tab === id}">${icon(ico)}<span>${t(id)}</span></button>`,
    )
    .join("");
}
function updateHtml(id: string, html: string): void {
  const el = $(id);
  if (el.innerHTML !== html) el.innerHTML = html;
}
function render(): void {
  const active = document.activeElement as HTMLElement | null;
  const action = active?.dataset.action,
    value = active?.dataset.value,
    entity = active?.dataset.entity;
  const scroll = $("panel").scrollTop;
  $("edition").textContent = t("edition");
  $("brand").textContent = t("brand");
  $("homestead").textContent = t("homestead");
  $("tagline").textContent = t("tagline");
  $("saveNote").innerHTML = `<i></i>${t("saved")}`;
  updateHtml("tabs", nav());
  updateHtml("mobileNav", nav());
  updateHtml("panel", panel(farm, view));
  $("panel").scrollTop = scroll;
  updateHtml("goal", goalCard(farm));
  updateHtml(
    "toolDock",
    (
      [
        ["inspect", "hand", "inspect"],
        ["build", "hammer", "build"],
        ["seed", "sprout", "seeds"],
        ["water", "water", "water"],
        ["move", "move", "move"],
      ] as const
    )
      .map(
        ([id, ico, label]) =>
          `<button data-action="tool" data-value="${id}" class="${view.mode === id ? "active" : ""}" aria-label="${t(label)}" aria-pressed="${view.mode === id}">${icon(ico)}<span>${t(label)}</span></button>`,
      )
      .join(""),
  );
  updateHtml(
    "zoomControls",
    [
      ["out", "minus", "zoomOut"],
      ["fit", "fit", "fit"],
      ["in", "plus", "zoomIn"],
    ]
      .map(
        ([id, ico, label]) =>
          `<button data-action="zoom" data-value="${id}" aria-label="${t(label)}">${icon(ico)}</button>`,
      )
      .join(""),
  );
  $("mapCaption").textContent = t("zoomHint");
  $("farmCanvas").setAttribute("aria-label", t("mapLabel"));
  document.querySelector(".mobile-close")?.setAttribute("aria-label", t("close"));
  $("workspace").classList.toggle("sidebar-open", view.mobileOpen);
  world.selected = view.selected;
  world.grid = view.mode === "build" || view.mode === "move";
  updateHtml(
    "pins",
    farm.entities
      .filter((e) => e.kind !== "path" && e.kind !== "fence" && e.kind !== "tree")
      .map((e) => {
        const label = e.crop ? name(ITEMS[e.crop].names) : name(BUILDINGS[e.kind].names);
        return `<button data-entity="${e.id}" class="map-pin ${e.kind === "plot" ? "plot-pin" : "building-pin"} ${e.id === view.selected ? "selected" : ""}" aria-label="${label} (${e.x + 1}, ${e.y + 1})${progress(e) >= 1 ? ` · ${t("ready")}` : ""}"><span>${label}</span></button>`;
      })
      .join(""),
  );
  updatePins();
  renderPlacement();
  header.setStat("coins", Math.floor(farm.coins));
  header.setStat("level", level(farm));
  if (action) {
    const match = [...document.querySelectorAll<HTMLElement>("[data-action]")].find(
      (e) =>
        e.dataset.action === action &&
        e.dataset.value === value &&
        !e.hasAttribute("disabled") &&
        e.offsetParent !== null,
    );
    match?.focus({ preventScroll: true });
  } else if (entity)
    document
      .querySelector<HTMLElement>(`[data-entity="${entity}"]`)
      ?.focus({ preventScroll: true });
}
function renderPlacement(): void {
  const hint =
    view.mode === "build"
      ? "buildHint"
      : view.mode === "move"
        ? "moveHint"
        : view.mode === "seed"
          ? "seedHint"
          : view.mode === "water"
            ? "waterHint"
            : "";
  $("modeHint").textContent = hint ? t(hint) : "";
  $("modeHint").hidden = !hint;
  const g = world.ghost;
  const placing = view.mode === "build" && g;
  $("placement").hidden = !placing;
  if (placing)
    updateHtml(
      "placement",
      `<div><small>${name(BUILDINGS[g.kind].names)} · ${g.x + 1}:${g.y + 1}</small>${money(BUILDINGS[g.kind].cost)}</div><button class="primary" data-action="confirm-build"${!fits(farm, g.kind, g.x, g.y, g.rotated) || farm.coins < BUILDINGS[g.kind].cost ? " disabled" : ""}>${icon("check")}${t("place")}</button><button class="square" data-action="rotate" aria-label="${t("rotate")}">${icon("rotate")}</button><button class="square" data-action="cancel" aria-label="${t("cancel")}">${icon("close")}</button>`,
    );
}
function updatePins(): void {
  for (const el of $("pins").querySelectorAll<HTMLElement>("[data-entity]")) {
    const e = farm.entities.find((e) => e.id === Number(el.dataset.entity));
    if (!e) continue;
    const p = world.entityPoint(e);
    el.style.left = `${p[0]}px`;
    el.style.top = `${p[1]}px`;
  }
}
function cancel(): void {
  previewPinned = false;
  view.mode = "inspect";
  moving = null;
  world.ghost = null;
}
function openTab(tab: View["tab"]): void {
  view.tab = tab;
  view.mobileOpen = true;
  $("panel").scrollTop = 0;
  if (tab !== "info") cancel();
  render();
}
function setTool(mode: Mode): void {
  previewPinned = false;
  view.mode = mode;
  world.ghost = null;
  moving = mode === "move" ? view.selected : null;
  if (mode === "build") {
    view.tab = "build";
    view.mobileOpen = true;
  }
  if (mode === "seed") {
    view.tab = "info";
    view.mobileOpen = true;
  }
  if (mode === "water" || mode === "move" || mode === "inspect") view.mobileOpen = false;
  render();
}
function selected(): Entity | undefined {
  return farm.entities.find((e) => e.id === view.selected);
}
function choose(e: Entity, smart = true): void {
  view.selected = e.id;
  view.tab = "info";
  if (smart && e.crop && progress(e) >= 1) run({ type: "harvest", id: e.id });
  else {
    view.mobileOpen = true;
    render();
  }
}
function rotate(): void {
  if (world.ghost) {
    world.ghost.rotated = !world.ghost.rotated;
    view.rotated = world.ghost.rotated;
    renderPlacement();
  } else if (view.mode === "build") view.rotated = !view.rotated;
  else {
    const e = selected();
    if (e) run({ type: "move", id: e.id, x: e.x, y: e.y, rotated: !e.rotated }, t("moved"));
  }
}
document.body.addEventListener("click", (event) => {
  const target = (event.target as Element).closest<HTMLElement>("[data-action], [data-entity]");
  if (!target || target.hasAttribute("disabled")) return;
  if (target.dataset.entity) {
    const entity = farm.entities.find((e) => e.id === Number(target.dataset.entity));
    if (event.detail === 0 && entity) {
      const p = world.screen(entity.x + 0.5, entity.y + 0.5);
      tap(...p, entity.id);
    }
    return;
  }
  const value = target.dataset.value || "",
    id = view.selected;
  switch (target.dataset.action) {
    case "tab":
      openTab(value as View["tab"]);
      break;
    case "close-panel":
      view.mobileOpen = false;
      render();
      break;
    case "category":
      view.category = value as View["category"];
      render();
      break;
    case "tool":
      setTool(value as Mode);
      break;
    case "build":
      previewPinned = false;
      view.build = value as Kind;
      view.mode = "build";
      view.rotated = false;
      world.ghost = null;
      moving = null;
      view.mobileOpen = false;
      render();
      break;
    case "confirm-build": {
      const g = world.ghost;
      if (
        g &&
        run({ type: "build", kind: g.kind, x: g.x, y: g.y, rotated: g.rotated }, t("built"))
      ) {
        world.ghost = null;
        previewPinned = false;
        renderPlacement();
      }
      break;
    }
    case "seed":
      view.seed = value as Crop;
      view.mode = "seed";
      view.mobileOpen = false;
      if (id && selected()?.kind === "plot" && !selected()?.crop)
        run({ type: "plant", id, crop: view.seed }, t("planted"));
      render();
      break;
    case "water-one":
      if (id) run({ type: "water", id }, t("watered"));
      break;
    case "harvest":
    case "collect":
    case "feed":
      if (id)
        run(
          { type: target.dataset.action, id },
          target.dataset.action === "feed" ? t("feeding") : undefined,
        );
      break;
    case "animal":
      if (id)
        run(
          { type: "animal", id, species: value as Species },
          name(ANIMALS[value as Species].names),
        );
      break;
    case "cook":
      if (id) run({ type: "cook", id, recipe: value as Recipe }, t("started"));
      break;
    case "sell-one":
    case "sell-all":
      run(
        {
          type: "sell",
          item: value as Item,
          count: target.dataset.action === "sell-one" ? 1 : farm.items[value as Item] || 0,
        },
        t("sold"),
      );
      break;
    case "order":
      run({ type: "order", slot: Number(value) });
      break;
    case "goal":
      run({ type: "goal" });
      break;
    case "rotate":
      rotate();
      break;
    case "remove":
      if (id && run({ type: "remove", id })) {
        view.selected = null;
        render();
      }
      break;
    case "cancel":
      cancel();
      render();
      break;
    case "zoom":
      if (value === "fit") world.fit();
      else world.zoomAt(value === "in" ? 1.2 : 1 / 1.2);
      updatePins();
      break;
  }
});

interface Gesture {
  start: [number, number];
  cell: [number, number];
  pan: [number, number];
  moved: boolean;
  entity?: number;
  source?: [number, number];
  picked: boolean;
}
const pointers = new Map<number, [number, number]>();
let gesture: Gesture | null = null,
  pinchDistance = 0,
  pinched = false;
const point = (e: PointerEvent | WheelEvent): [number, number] => {
  const r = stage.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};
const distance = () => {
  const p = [...pointers.values()];
  return Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
};
function tap(x: number, y: number, target?: number): void {
  const cell = world.cell(x, y),
    e = target ? farm.entities.find((e) => e.id === target) : entityAt(farm, ...cell);
  if (view.mode === "build") {
    previewPinned = true;
    world.ghost = { kind: view.build, x: cell[0], y: cell[1], rotated: view.rotated };
    renderPlacement();
    return;
  }
  if (view.mode === "move") {
    if (moving === null) {
      if (e) {
        moving = e.id;
        view.selected = e.id;
        world.selected = e.id;
        render();
      }
      return;
    }
    const source = farm.entities.find((e) => e.id === moving);
    if (source && run({ type: "move", id: source.id, x: cell[0], y: cell[1] }, t("moved"))) {
      moving = null;
      world.ghost = null;
    }
    return;
  }
  if (view.mode === "seed") {
    if (e?.crop && progress(e) >= 1) run({ type: "harvest", id: e.id });
    else if (e) run({ type: "plant", id: e.id, crop: view.seed }, t("planted"));
    else notify(t("needEmpty"));
    return;
  }
  if (view.mode === "water") {
    if (e) run({ type: "water", id: e.id }, t("watered"));
    return;
  }
  if (e) choose(e);
  else {
    view.selected = null;
    world.selected = null;
    view.mobileOpen = false;
    render();
  }
}
stage.addEventListener("pointerdown", (e) => {
  if ((e.target as Element).closest(".tool-dock,.placement-bar,.zoom-controls,.goal-card")) return;
  const p = point(e);
  pointers.set(e.pointerId, p);
  stage.setPointerCapture(e.pointerId);
  if (pointers.size > 1) {
    pinchDistance = distance();
    pinched = true;
    gesture = null;
    world.ghost = null;
    return;
  }
  pinched = false;
  const target = (e.target as Element).closest<HTMLElement>("[data-entity]");
  const cell = world.cell(...p);
  const entity = target
    ? farm.entities.find((b) => b.id === Number(target.dataset.entity))
    : entityAt(farm, ...cell);
  let picked = false;
  if (view.mode === "move" && entity && moving === null) {
    moving = entity.id;
    view.selected = entity.id;
    world.selected = entity.id;
    picked = true;
  }
  const dragging = view.mode === "move" && entity?.id === moving ? entity : undefined;
  gesture = {
    start: p,
    cell,
    pan: [...world.pan],
    moved: false,
    entity: entity?.id,
    source: dragging ? [dragging.x, dragging.y] : undefined,
    picked,
  };
});
stage.addEventListener("pointermove", (e) => {
  const p = point(e);
  if (!pointers.has(e.pointerId)) {
    if (
      e.pointerType === "mouse" &&
      !previewPinned &&
      view.mode === "build" &&
      !(e.target as Element).closest("button,.goal-card")
    ) {
      const cell = world.cell(...p);
      world.ghost = { kind: view.build, x: cell[0], y: cell[1], rotated: view.rotated };
      renderPlacement();
    }
    return;
  }
  pointers.set(e.pointerId, p);
  if (pointers.size === 2) {
    const next = distance(),
      ps = [...pointers.values()];
    if (pinchDistance > 0)
      world.zoomAt(next / pinchDistance, (ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2);
    pinchDistance = next;
    updatePins();
    return;
  }
  if (!gesture || pinched) return;
  const dx = p[0] - gesture.start[0],
    dy = p[1] - gesture.start[1];
  if (Math.hypot(dx, dy) > 6) gesture.moved = true;
  if (!gesture.moved) return;
  if (gesture.source && moving) {
    const source = farm.entities.find((e) => e.id === moving);
    if (!source) return;
    const cell = world.cell(...p);
    world.ghost = {
      kind: source.kind,
      x: gesture.source[0] + cell[0] - gesture.cell[0],
      y: gesture.source[1] + cell[1] - gesture.cell[1],
      rotated: source.rotated,
      id: source.id,
    };
  } else {
    world.pan = [gesture.pan[0] + dx, gesture.pan[1] + dy];
    world.clamp();
    updatePins();
  }
});
function endPointer(e: PointerEvent, canceled = false): void {
  if (!pointers.has(e.pointerId)) return;
  const p = point(e),
    g = gesture;
  pointers.delete(e.pointerId);
  if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  if (canceled || pinched) {
    gesture = null;
    world.ghost = null;
    renderPlacement();
    return;
  }
  gesture = null;
  if (g?.moved) {
    if (g.source && moving && world.ghost) {
      const ghost = world.ghost;
      run({ type: "move", id: moving, x: ghost.x, y: ghost.y, rotated: ghost.rotated }, t("moved"));
      moving = null;
      world.ghost = null;
      render();
    }
    return;
  }
  if (g?.picked || (view.mode === "move" && g?.entity === moving)) {
    render();
    return;
  }
  tap(...p, g?.entity);
}
stage.addEventListener("pointerup", (e) => endPointer(e));
stage.addEventListener("pointercancel", (e) => endPointer(e, true));
stage.addEventListener(
  "wheel",
  (e) => {
    if ((e.target as Element).closest(".goal-card")) return;
    e.preventDefault();
    world.zoomAt(Math.exp(-e.deltaY * 0.0015), ...point(e));
    updatePins();
  },
  { passive: false },
);
let cursor: [number, number] = [5, 7];
document.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    $<HTMLDialogElement>("guide").open ||
    (event.target as Element).matches("input,select,textarea")
  )
    return;
  const key = event.key.toLowerCase();
  if (["b", "m", "w", "escape", "r", "+", "-", "=", "0"].includes(key)) event.preventDefault();
  if (key === "b") setTool("build");
  else if (key === "m") setTool("move");
  else if (key === "w") setTool("water");
  else if (key === "escape") {
    cancel();
    view.mobileOpen = false;
    render();
  } else if (key === "r") rotate();
  else if (key === "+" || key === "=") world.zoomAt(1.2);
  else if (key === "-") world.zoomAt(1 / 1.2);
  else if (key === "0") world.fit();
  if (event.target === $("farmCanvas")) {
    const delta: Record<string, [number, number]> = {
      arrowleft: [-1, 0],
      arrowright: [1, 0],
      arrowup: [0, -1],
      arrowdown: [0, 1],
    };
    if (delta[key]) {
      event.preventDefault();
      cursor = [
        Math.max(0, Math.min(11, cursor[0] + delta[key][0])),
        Math.max(0, Math.min(11, cursor[1] + delta[key][1])),
      ];
      world.ghost = {
        kind: view.mode === "build" ? view.build : "plot",
        x: cursor[0],
        y: cursor[1],
        rotated: view.rotated,
      };
      renderPlacement();
    }
    if (key === "enter" || key === " ") {
      event.preventDefault();
      const p = world.screen(cursor[0] + 0.5, cursor[1] + 0.5);
      tap(...p);
    }
  }
  updatePins();
});
const observer = new ResizeObserver(() => {
  world.resize();
  updatePins();
});
observer.observe(stage);
MG.i18n.onChange(() => {
  render();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    advance(farm);
    save();
    pointers.clear();
    gesture = null;
  } else {
    advance(farm);
    render();
  }
});
window.addEventListener("pagehide", () => {
  advance(farm);
  save();
});
window.addEventListener("blur", () => {
  pointers.clear();
  gesture = null;
  world.ghost = null;
});
let lastRender = 0,
  lastSave = 0,
  lastDraw = 0;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
function frame(time: number): void {
  if (time - lastDraw > 30) {
    advance(farm);
    world.draw(farm, reduced.matches ? 0 : time);
    lastDraw = time;
  }
  if (time - lastRender > 700 && !pointers.size) {
    render();
    lastRender = time;
  }
  if (time - lastSave > 5000) {
    save();
    lastSave = time;
  }
  requestAnimationFrame(frame);
}
world.resize();
render();
save();
requestAnimationFrame(frame);

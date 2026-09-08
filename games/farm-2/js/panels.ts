import { thumbnail } from "./art";
import {
  ANIMALS,
  BUILDINGS,
  CROPS,
  type Crop,
  GOALS,
  ITEMS,
  type Item,
  type Kind,
  ORDER_POOL,
  RECIPES,
  type Recipe,
  type Species,
} from "./data";
import { icon, name, t } from "./i18n";
import { canPay, type Entity, type Farm, level, progress } from "./model";

export type Mode = "inspect" | "seed" | "water" | "move" | "build";
export interface View {
  tab: "build" | "storage" | "orders" | "info";
  category: "grow" | "produce" | "decorate";
  selected: number | null;
  mode: Mode;
  seed: Crop;
  build: Kind;
  rotated: boolean;
  mobileOpen: boolean;
}
const button = (action: string, body: string, arg = "", disabled = false, style = "primary") =>
  `<button class="${style}" data-action="${action}" data-value="${arg}"${disabled ? " disabled" : ""}>${body}</button>`;
export const money = (n: number): string => `<span class="money">${icon("coin")}${n}</span>`;
export const duration = (n: number): string => `${Math.ceil(n)}${t("seconds")}`;
function bar(n: number): string {
  return `<div class="progress-track"><i style="width:${Math.max(0, Math.min(100, n * 100))}%"></i></div>`;
}
function ingredients(s: Farm, items: Partial<Record<Item, number>>): string {
  return `<div class="ingredients">${(Object.entries(items) as [Item, number][]).map(([id, n]) => `<span class="${(s.items[id] || 0) < n ? "missing" : ""}">${ITEMS[id].icon} ${s.items[id] || 0}/${n}<small>${name(ITEMS[id].names)}</small></span>`).join("")}</div>`;
}
export function seedCards(s: Farm, v: View): string {
  return `<div class="section-label">${t("seedChoose")}</div><div class="seed-grid">${(Object.entries(CROPS) as [Crop, (typeof CROPS)[Crop]][]).map(([id, d]) => button("seed", `<span class="seed-emoji">${ITEMS[id].icon}</span><strong>${name(ITEMS[id].names)}</strong><small>${level(s) < d.level ? `${t("level")} ${d.level}` : d.cost ? `${d.cost} ◉` : t("free")}</small><em>${duration(d.seconds)}</em>`, id, level(s) < d.level, `seed-card ${v.seed === id && v.mode === "seed" ? "chosen" : ""}`)).join("")}</div>`;
}
function recipes(s: Farm, e: Entity): string {
  let h = "";
  if (e.job) {
    const d = RECIPES[e.job.recipe],
      ready = progress(e) >= 1;
    h += `<div class="production-card"><span class="production-icon">${ITEMS[e.job.recipe].icon}</span><div><strong>${name(ITEMS[e.job.recipe].names)}</strong><small>${ready ? t("ready") : `${t("working")} · ${duration(d.seconds - e.job.progress)}`}</small></div>${bar(progress(e))}${button("collect", `${icon(ready ? "check" : "clock")}${ready ? t("collect") : duration(d.seconds - e.job.progress)}`, "", !ready)}</div>`;
  }
  h += `<div class="section-label">${t("recipes")}</div>`;
  for (const [id, d] of Object.entries(RECIPES) as [Recipe, (typeof RECIPES)[Recipe]][]) {
    if (d.at !== e.kind) continue;
    h += `<article class="recipe"><div class="recipe-title"><span>${ITEMS[id].icon}</span><div><strong>${name(ITEMS[id].names)}</strong><small>${duration(d.seconds)} · +${d.xp} XP${d.amount > 1 ? ` · ×${d.amount}` : ""}</small></div></div>${ingredients(s, d.ingredients)}${button("cook", `${icon("pot")}${t("make")}`, id, !!e.job || !canPay(s, d.ingredients), "secondary wide")}</article>`;
  }
  return h;
}
function animals(s: Farm, e: Entity): string {
  const ready = e.animals.reduce((n, a) => n + a.ready, 0),
    hungry = e.animals.filter((a) => a.fed <= 0),
    cost = hungry.reduce((n, a) => n + ANIMALS[a.species].feed, 0);
  let h = `<div class="section-label">${t("animals")} <span>${e.animals.length}/4</span></div>`;
  for (const a of e.animals) {
    const d = ANIMALS[a.species];
    h += `<div class="animal-row"><span>${d.icon}</span><div><strong>${name(d.names)}</strong><small>${a.ready ? `${ITEMS[d.product].icon} ×${a.ready}` : a.fed > 0 ? `${t("fed")} · ${duration(d.seconds - a.progress)}` : t("hungry")}</small>${bar(a.ready ? 1 : a.progress / d.seconds)}</div><i class="status-dot ${a.fed > 0 ? "green" : ""}"></i></div>`;
  }
  h += `<div class="action-stack">${button("feed", `${icon("leaf")}${t("feed")} ${cost ? `· 🌾 ${cost}` : ""}`, "", !hungry.length || (s.items.wheat || 0) < cost, "secondary wide")}${button("collect", `${icon("box")}${t("collect")} · ${ready}`, "", !ready)}</div><p class="fine-print">${t("feedNote")}</p><div class="section-label">${t("buyAnimal")}</div>`;
  for (const [id, d] of Object.entries(ANIMALS) as [Species, (typeof ANIMALS)[Species]][]) {
    if (d.kind === e.kind)
      h += button(
        "animal",
        `<span>${d.icon} ${name(d.names)}</span>${money(d.cost)}`,
        id,
        e.animals.length >= 4 || s.coins < d.cost,
        "animal-buy",
      );
  }
  return h;
}
function selected(s: Farm, v: View): string {
  const e = s.entities.find((e) => e.id === v.selected);
  if (v.mode === "seed")
    return `<h2>${t("seeds")}</h2><p class="panel-intro">${t("seedHint")}</p>${seedCards(s, v)}`;
  if (!e || e.kind === "cottage")
    return `<div class="welcome-art"><img src="${thumbnail("cottage")}" alt=""></div><h2>${t("welcome")}</h2><p class="panel-intro">${t("welcomeBody")}</p><div class="farm-summary"><div><strong>${s.entities.filter((e) => e.kind === "plot").length}</strong>${name(BUILDINGS.plot.names)}</div><div><strong>${s.entities.reduce((n, e) => n + e.animals.length, 0)}</strong>${t("animals")}</div></div>${button("tab", `${icon("hammer")}${t("build")}`, "build")}<p class="fine-print">${t("zoomHint")}</p>`;
  let h = `<div class="object-preview"><img src="${thumbnail(e.kind)}" alt=""><span class="coordinate">${e.x + 1} : ${e.y + 1}</span></div><h2>${name(BUILDINGS[e.kind].names)}</h2>`;
  if (e.kind === "plot") {
    if (e.crop) {
      const ready = progress(e) >= 1,
        d = CROPS[e.crop];
      h += `<p class="panel-intro">${ITEMS[e.crop].icon} ${name(ITEMS[e.crop].names)} · ${ready ? t("ready") : duration((d.seconds - e.growth) / (e.watered ? 1.7 : 1))}</p>${bar(progress(e))}<div class="action-stack">${button("harvest", `${icon("sprout")}${t("harvest")} · ×${d.yield}`, "", !ready)}${button("water-one", `${icon("water")}${e.watered ? t("wateredLabel") : t("water")}`, "", ready || e.watered, "secondary wide")}</div>`;
    } else h += `<p class="panel-intro">${t("empty")}</p>${seedCards(s, v)}`;
  } else if (e.kind === "coop" || e.kind === "barn") h += animals(s, e);
  else if (e.kind === "kitchen" || e.kind === "mill" || e.kind === "dairy") h += recipes(s, e);
  else h += `<p class="panel-intro">${t("decoration")}</p>`;
  h += `<div class="object-actions">${button("tool", `${icon("move")}${t("move")}`, "move", false, "secondary")}${button("rotate", `${icon("rotate")}${t("rotate")}`, "", false, "secondary")}${button("remove", t("remove"), "", !!e.crop || !!e.job || e.animals.length > 0, "text-button")}</div>`;
  return h;
}
export function panel(s: Farm, v: View): string {
  if (v.tab === "info") return selected(s, v);
  if (v.tab === "build") {
    const categories = ["grow", "produce", "decorate"]
      .map((id) => button("category", t(id), id, false, id === v.category ? "active" : ""))
      .join("");
    const cards = (Object.entries(BUILDINGS) as [Kind, (typeof BUILDINGS)[Kind]][])
      .filter(([id, d]) => id !== "cottage" && d.category === v.category)
      .map(([id, d]) =>
        button(
          "build",
          `<img src="${thumbnail(id)}" alt=""><strong>${name(d.names)}</strong><div><small>${d.w} × ${d.h}</small>${money(d.cost)}</div>`,
          id,
          s.coins < d.cost,
          `build-card ${v.mode === "build" && v.build === id ? "chosen" : ""}`,
        ),
      )
      .join("");
    return `<h2>${t("catalog")}</h2><p class="panel-intro">${t("catalogHint")}</p><div class="category-tabs">${categories}</div><div class="build-grid">${cards}</div><div class="catalog-note">${icon("move")}<span>${t("moveHint")}</span></div>`;
  }
  if (v.tab === "storage") {
    const items = (Object.entries(ITEMS) as [Item, (typeof ITEMS)[Item]][]).filter(
      ([id]) => (s.items[id] || 0) > 0,
    );
    const rows = items
      .map(
        ([id, d]) =>
          `<article class="pantry-row"><span class="item-emoji">${d.icon}</span><div><strong>${name(d.names)} <b>×${s.items[id]}</b></strong><small>${money(d.price)} / 1</small><div class="sell-actions">${button("sell-one", t("sellOne"), id, false, "text-button")}${button("sell-all", t("sellAll"), id, false, "text-button")}</div></div></article>`,
      )
      .join("");
    return `<h2>${t("pantryTitle")}</h2><p class="panel-intro">${t("pantryHint")}</p>${items.length ? rows : `<p>${t("nothing")}</p>`}`;
  }
  const cards = s.orders
    .map((id, i) => {
      const o = ORDER_POOL[id % ORDER_POOL.length];
      return `<article class="order-card"><div class="order-person"><span class="avatar avatar-${o.person}">${o.person === "mila" ? "M" : o.person === "oscar" ? "O" : "L"}</span><div><strong>${t(o.person)}</strong><small>№ ${String(id + 1).padStart(3, "0")}</small></div></div>${ingredients(s, o.items)}<div class="order-reward">${money(o.coins)}<span>+${o.xp} XP</span></div>${button("order", `${t("deliver")}${icon("arrow")}`, String(i), !canPay(s, o.items))}</article>`;
    })
    .join("");
  return `<h2>${t("orderTitle")}</h2><p class="panel-intro">${t("orderHint")}</p>${cards}`;
}
export function goalCard(s: Farm): string {
  const goal = GOALS[s.goal];
  if (!goal)
    return `<div class="goal-complete">${icon("leaf")}<strong>${t("allGoals")}</strong></div>`;
  const count = Math.min(goal.target, s.stats[goal.stat]);
  const reward =
    count >= goal.target
      ? button("goal", `${t("claim")} ${money(goal.coins)}`)
      : `<small>${money(goal.coins)}</small>`;
  return `<div class="goal-top"><span>${t("goalLabel")}</span><b>${count}/${goal.target}</b></div><strong>${t(`goal${s.goal}`)}</strong>${bar(count / goal.target)}${reward}`;
}

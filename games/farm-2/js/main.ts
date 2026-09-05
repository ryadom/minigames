import { MG } from "../../../shared/mg";
import { cropArt, plotArt, scenery, toolArt } from "./art";
import { t } from "./i18n";
import {
  CROP_IDS,
  CROPS,
  type CropId,
  claimMilestone,
  createFarm,
  type DayReport,
  deliver,
  endDay,
  type Farm,
  ITEM_IDS,
  type ItemId,
  LEVEL_XP,
  level,
  MAX_PLOTS,
  MILESTONES,
  maxEnergy,
  milestoneProgress,
  price,
  type Result,
  ready,
  restoreFarm,
  season,
  seasonDay,
  sell,
  type Tool,
  type Upgrade,
  upgrade,
  upgradeCost,
  weather,
  workPlot,
} from "./model";

const app = document.getElementById("game") as HTMLElement;
const toast = document.getElementById("toast") as HTMLElement;
const dialog = document.getElementById("dialog") as HTMLDialogElement;
const store = MG.storage<Farm>("farm-2", { version: 1 });
let farm = restoreFarm(store.load());
let selected: CropId = "wheat";
let tool: Tool = "harvest";
let tab: "orders" | "market" | "workshop" = "orders";
let saveOk = true;
let toastTimer: ReturnType<typeof setTimeout>;
let report: DayReport | null = null;
let dialogOpener: HTMLElement | null = null;
const background = scenery();
const seasons = ["spring", "summer", "autumn", "winter"];
const weatherIcons = { sunny: "☀", cloudy: "☁", rainy: "☂" };

const ui = MG.mountHeader({
  icon: "🌱",
  titleKey: "title",
  actions: [
    { key: "help", labelKey: "help", onClick: () => showDialog(null) },
    {
      key: "new",
      labelKey: "newFarm",
      onClick: () => {
        if (!window.confirm(t("confirmReset"))) return;
        farm = createFarm();
        selected = "wheat";
        tool = "harvest";
        tab = "orders";
        persist();
        render();
      },
    },
  ],
});

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function persist(): void {
  store.save(farm);
  try {
    const saved = JSON.parse(localStorage.getItem(store.key) || "null");
    saveOk = JSON.stringify(saved?.data) === JSON.stringify(farm);
  } catch {
    saveOk = false;
  }
}
function announce(message: string): void {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
}
function complete(result: Result): void {
  if (result.ok) persist();
  render();
  const values = { ...result.values };
  if (typeof values.item === "string") values.item = t(values.item);
  const key =
    result.message === "planted" && weather(farm.day) === "rainy" ? "plantedRain" : result.message;
  announce(t(key, values));
}

function plotButton(index: number): string {
  const plot = farm.plots[index];
  const ripe = plot && ready(plot);
  const col = index % 4;
  const row = Math.floor(index / 4);
  const x = 500 + (col - row) * 62;
  const y = 245 + (col + row) * 31;
  const stateText = !plot
    ? t("lockedPlot")
    : !plot.crop
      ? t("empty")
      : ripe
        ? t("ready")
        : `${t("growing", { n: plot.growth, total: CROPS[plot.crop].days })} · ${t(plot.watered ? "wateredState" : "thirsty")}`;
  const label = `${t("plot", { n: index + 1 })}. ${plot?.crop ? `${t(plot.crop)}. ` : ""}${stateText}`;
  return `<button type="button" id="plot-${index}" data-action="plot" data-index="${index}"
    class="plot ${!plot ? "locked" : ""} ${ripe ? "ripe" : ""} ${plot?.watered ? "wet" : ""}"
    style="--x:${(x - 60) / 10}%;--y:${(y - 76) / 6.5}%;--layer:${row + col + 1}"
    aria-label="${esc(label)}" title="${esc(label)}">${plotArt(plot)}
    ${ripe ? `<span class="plot-marker ready-marker" aria-hidden="true">✓</span>` : plot?.crop && !plot.watered ? `<span class="plot-marker water-marker" aria-hidden="true">●</span>` : ""}
    </button>`;
}
function seeds(): string {
  return CROP_IDS.map((id) => {
    const crop = CROPS[id];
    const locked = crop.level > level(farm);
    return `<button type="button" id="seed-${id}" class="seed ${selected === id ? "selected" : ""}" data-action="seed" data-item="${id}" aria-pressed="${selected === id}" ${locked ? "disabled" : ""}
      title="${esc(t("seedDetail", { days: crop.days, yield: crop.yield, price: price(farm, id) }))}">
      <span class="seed-art">${cropArt(id)}</span><span class="seed-name">${t(id)}</span>
      <span class="seed-price">${locked ? t("unlock", { level: crop.level }) : crop.seed ? `◉ ${crop.seed}` : t("free")}</span>
      <span class="seed-days">${t("days", { n: crop.days })}</span>
    </button>`;
  }).join("");
}
function journal(): string {
  const goal = MILESTONES[farm.milestone];
  if (!goal)
    return `<div class="journal-heading"><span>✿</span>${t("journal")}</div><h3>${t("journalDone")}</h3><p>${t("journalDoneDetail")}</p>`;
  const key = ["goalHarvest", "goalOrders", "goalLand", "goalHens", "goalSeason"][farm.milestone];
  const progress = Math.min(goal.goal, milestoneProgress(farm));
  return `<div class="journal-heading"><span>✎</span>${t("journal")}</div>
    <div class="chapter">${t("chapter", { n: farm.milestone + 1 })}</div><h3>${t(key)}</h3><p>${t(`${key}Detail`)}</p>
    <div class="goal-meter"><progress max="${goal.goal}" value="${progress}" aria-label="${t(key)}"></progress><span>${progress}/${goal.goal}</span></div>
    <button type="button" class="claim" id="claim" data-action="claim" ${progress < goal.goal ? "disabled" : ""}>${t("claim", { coins: goal.reward })} <span>↗</span></button>`;
}
function orders(): string {
  return `<h2>${t("villageOrders")}</h2><p class="panel-intro">${t("ordersHint")}</p>${farm.orders
    .map((order, i) => {
      const have = farm.inventory[order.item];
      const canDeliver = have >= order.quantity;
      return `<article class="order"><div class="order-person"><span class="avatar avatar-${i}">${["O", "R", "V"][i]}</span><span>${t(`villager${i}`)}</span><span class="order-number">0${i + 1}</span></div>
      <div class="order-product"><span class="produce-art">${cropArt(order.item)}</span><div><strong>${order.quantity} × ${t(order.item)}</strong><small>${t("orderNeed", { have, need: order.quantity })}</small></div></div>
      <div class="order-bottom"><span>${t("orderReward", { coins: order.coins, xp: order.xp })}</span><button type="button" class="button small ${canDeliver ? "primary" : ""}" id="deliver-${i}" data-action="deliver" data-index="${i}" ${canDeliver ? "" : "disabled"}>${t("deliver")} ↗</button></div></article>`;
    })
    .join("")}`;
}
function market(): string {
  const items = ITEM_IDS.filter((id) => farm.inventory[id] > 0);
  return `<h2>${t("marketTitle")}</h2><p class="panel-intro">${t("marketHint")}</p>${
    items.length
      ? items
          .map(
            (id) => `<article class="market-item">
    <div class="order-product"><span class="produce-art">${cropArt(id)}</span><div><strong>${t(id)}</strong><small>${t("inBarn", { n: farm.inventory[id] })} · ${t("each", { coins: price(farm, id) })}</small>${id !== "egg" && CROPS[id].season === season(farm.day) ? `<span class="seasonal">✿ ${t("seasonal")}</span>` : ""}</div></div>
    <div class="market-actions"><button type="button" class="button small" id="sell-${id}" data-action="sell" data-item="${id}">${t("sellOne")}</button><button type="button" class="button small primary" id="sell-all-${id}" data-action="sell-all" data-item="${id}">${t("sellAll")} · ${farm.inventory[id] * price(farm, id)}</button></div></article>`,
          )
          .join("")
      : `<div class="empty-barn"><span>♧</span><p>${t("emptyBarn")}</p></div>`
  }`;
}
function workshop(): string {
  return `<h2>${t("workshopTitle")}</h2><p class="panel-intro">${t("workshopHint")}</p>${(
    ["land", "well", "coop"] as Upgrade[]
  )
    .map((kind) => {
      const cost = upgradeCost(farm, kind);
      const locked = kind === "coop" && level(farm) < 2;
      return `<article class="upgrade"><span class="upgrade-icon">${{ land: "▦", well: "♧", coop: "⌂" }[kind]}</span><div><h3>${t(kind)}</h3><p>${t(`${kind}Detail`, { n: kind === "land" ? farm.plots.length : farm.well })}</p>
      <button type="button" class="button small" id="upgrade-${kind}" data-action="upgrade" data-item="${kind}" ${cost === null || locked || farm.coins < cost ? "disabled" : ""}>${cost === null ? t("maxed") : locked ? t("unlock", { level: 2 }) : t("buy", { coins: cost })}</button></div></article>`;
    })
    .join(
      "",
    )}${farm.hens ? `<div class="coop-note"><strong>🐔 ${t("hens", { n: farm.hens, feed: farm.inventory.wheat })}</strong><p>${t("coopNote")}</p></div>` : ""}`;
}

function render(): void {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.id : "";
  const lvl = level(farm);
  const xpBase = LEVEL_XP[lvl - 1];
  const xpNext = LEVEL_XP[lvl];
  const currentWeather = weather(farm.day);
  const note =
    farm.energy === 0
      ? "noteEnergy"
      : farm.harvested === 0
        ? "noteStart"
        : currentWeather === "rainy"
          ? "noteRain"
          : "noteDry";
  app.innerHTML = `<div class="page-heading"><div><div class="eyebrow">${t("edition")}</div><h1>${t("heading")}<span class="heading-flower" aria-hidden="true">✿</span></h1><p>${t("subtitle")}</p></div>
    <div class="level-box"><span class="level-icon">✦</span><div><strong>${t("levelLabel", { level: lvl })}</strong><small>${xpNext === undefined ? t("maxLevel") : t("nextLevel", { n: xpNext - farm.xp, level: lvl + 1 })}</small><progress max="${xpNext === undefined ? 1 : xpNext - xpBase}" value="${xpNext === undefined ? 1 : farm.xp - xpBase}" aria-label="${t("level")}"></progress></div></div></div>
    <div class="day-bar"><div class="calendar"><span class="weather-icon">${weatherIcons[currentWeather]}</span><div><strong>${t(seasons[season(farm.day)])}<span> / </span>${t("dayLabel", { day: seasonDay(farm.day) })}</strong><small>${t(currentWeather)} · ${t("yearLabel", { year: Math.floor((farm.day - 1) / 32) + 1 })}</small></div></div>
      <div class="resources"><div class="resource coin-resource"><span>◉</span><div><small>${t("coins")}</small><strong>${farm.coins}</strong></div></div><div class="resource" title="${esc(t("energyHint"))}"><span class="energy-icon">ϟ</span><div><small>${t("energy")}</small><strong>${farm.energy}<em> / ${maxEnergy(farm)}</em></strong></div></div></div>
      <button type="button" class="button end-day" id="end-day" data-action="end-day">${t("endDay")} <span>☾</span></button></div>
    <div class="game-layout"><section class="garden-column"><div class="farm-card">
      <div class="farm-card-heading"><span><i></i>${t("yourFarm")}</span><span class="forecast">${t("tomorrow", { weather: t(weather(farm.day + 1)) })} ${weatherIcons[weather(farm.day + 1)]}</span></div>
      <div class="farm-scene ${currentWeather} season-${season(farm.day)}" data-tool="${tool}"><div class="scenery">${background}</div><div class="field-layer" role="group" aria-label="${t("field")}">${Array.from({ length: MAX_PLOTS }, (_, i) => plotButton(i)).join("")}</div>
      <div class="farm-name" aria-hidden="true">MEADOW<br><span>EST. YEAR ${Math.floor((farm.day - 1) / 32) + 1}</span></div></div>
      <div class="toolbelt"><span class="toolbelt-hint">${t("farmHint")}</span><div class="tools" role="group" aria-label="${t("toolHint")}">${(["plant", "water", "harvest"] as Tool[]).map((kind, i) => `<button type="button" id="tool-${kind}" data-action="tool" data-item="${kind}" class="tool ${tool === kind ? "active" : ""}" aria-pressed="${tool === kind}"><span class="tool-icon">${toolArt(kind)}</span>${t(kind)}<kbd>${i + 1}</kbd></button>`).join("")}</div></div></div>
      <section class="seed-box"><div class="section-heading"><h2>${t("seedTitle")}</h2><span>${t("seedHint")}</span></div><div class="seeds">${seeds()}</div><p class="seed-details"><strong>${t(selected)}</strong> · ${t("seedDetail", { days: CROPS[selected].days, yield: CROPS[selected].yield, price: price(farm, selected) })}</p></section>
      <div class="garden-footer"><span class="save-status ${saveOk ? "" : "save-error"}">${saveOk ? "✓" : "!"} ${t(saveOk ? "saved" : "saveUnavailable")}</span><span>${t("restHint")}</span></div></section>
      <aside class="sidebar"><section class="journal">${journal()}</section><section class="village-panel"><div class="tabs" role="tablist" aria-label="${t("villageOrders")}">${(["orders", "market", "workshop"] as const).map((id) => `<button type="button" role="tab" id="tab-${id}" aria-selected="${tab === id}" aria-controls="village-content" tabindex="${tab === id ? 0 : -1}" class="tab ${tab === id ? "active" : ""}" data-action="tab" data-item="${id}">${t(`${id}Tab`)}</button>`).join("")}</div><div class="panel-content" id="village-content" role="tabpanel" aria-labelledby="tab-${tab}" tabindex="0">${tab === "orders" ? orders() : tab === "market" ? market() : workshop()}</div></section>
      <div class="daily-note"><span class="note-flower">✿</span><div><h3>${t("noteTitle")}</h3><p>${t(note)}</p></div></div></aside></div>`;
  if (focused) {
    const next = document.getElementById(focused);
    const fallback = focused === "claim" ? "tab-orders" : `tab-${tab}`;
    (next && !next.matches(":disabled") ? next : document.getElementById(fallback))?.focus({
      preventScroll: true,
    });
  }
  if (dialog.open) renderDialog();
}

function renderDialog(): void {
  dialog.innerHTML = report
    ? `<div class="dialog-flower">${weatherIcons[weather(farm.day)]}</div><div class="eyebrow">${t(seasons[season(farm.day)])} · ${t("dayLabel", { day: seasonDay(farm.day) })}</div><h2 id="dialog-title">${t("daySummary")}</h2><p>${t("morning", { n: farm.plots.filter(ready).length })}</p>${report.dry ? `<p>${t("dryReport", { n: report.dry })}</p>` : ""}${report.eggs ? `<p>${t("eggReport", { n: report.eggs })}</p>` : ""}${report.hungry ? `<p>${t("hungryReport", { n: report.hungry })}</p>` : ""}<p class="dialog-note">${t(weather(farm.day) === "rainy" ? "noteRain" : "noteDry")}</p><button type="button" class="button primary" data-action="close-dialog" autofocus>${t("continue")} ↗</button>`
    : `<div class="dialog-flower">✿</div><h2 id="dialog-title">${t("help")}</h2><p>${t("helpIntro")}</p>${["helpPlant", "helpWater", "helpHarvest", "helpTrade"].map((key) => `<h3>${t(key)}</h3><p>${t(`${key}Detail`)}</p>`).join("")}<p class="dialog-note">${t("helpKeyboard")}</p><button type="button" class="button primary" data-action="close-dialog" autofocus>${t("close")}</button>`;
}
function showDialog(summary: DayReport | null): void {
  report = summary;
  dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderDialog();
  dialog.showModal();
}
dialog.addEventListener("close", () => {
  if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
});
dialog.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest('[data-action="close-dialog"]')) dialog.close();
});

app.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
  if (!button || button.disabled) return;
  const { action, item, index } = button.dataset;
  if (action === "plot") {
    const idx = Number(index);
    if (!farm.plots[idx]) {
      tab = "workshop";
      render();
      announce(t("lockedPlot"));
      return;
    }
    complete(workPlot(farm, idx, tool, selected));
  } else if (action === "seed" && CROP_IDS.includes(item as CropId)) {
    selected = item as CropId;
    tool = "plant";
    render();
    announce(t("selectedSeed", { item: t(selected) }));
  } else if (action === "tool" && ["plant", "water", "harvest"].includes(item || "")) {
    tool = item as Tool;
    render();
    announce(t("toolSelected", { tool: t(tool) }));
  } else if (action === "tab" && ["orders", "market", "workshop"].includes(item || "")) {
    tab = item as typeof tab;
    render();
  } else if (action === "end-day") {
    const summary = endDay(farm);
    persist();
    render();
    showDialog(summary);
  } else if (action === "deliver") complete(deliver(farm, Number(index)));
  else if (action === "claim") complete(claimMilestone(farm));
  else if (action === "upgrade") complete(upgrade(farm, item as Upgrade));
  else if (action === "sell" || action === "sell-all") {
    complete(sell(farm, item as ItemId, action === "sell" ? 1 : farm.inventory[item as ItemId]));
  }
});
document.addEventListener("keydown", (event) => {
  if (dialog.open || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target as HTMLElement;
  if (target.matches("input, select, textarea") || target.isContentEditable) return;
  if (
    target.getAttribute("role") === "tab" &&
    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
  ) {
    event.preventDefault();
    const tabs = ["orders", "market", "workshop"] as const;
    const idx =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? 2
          : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    tab = tabs[idx];
    render();
    document.getElementById(`tab-${tab}`)?.focus();
  } else if (["1", "2", "3"].includes(event.key)) {
    tool = (["plant", "water", "harvest"] as Tool[])[Number(event.key) - 1];
    render();
    announce(t("toolSelected", { tool: t(tool) }));
  }
});
MG.i18n.onChange(render);
window.addEventListener("pagehide", persist);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persist();
});
persist();
render();
// Keep the shared help action discoverable to assistive technology.
ui.action("help")?.setAttribute("aria-haspopup", "dialog");

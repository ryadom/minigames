// Home page: renders the game list from the GAMES registry and wires up the
// shared language control (MG.i18n). Everything re-renders when the language
// changes.
import { GAMES, type Game, type Localized } from "./games";
import { MG } from "./shared/mg";
import type { SaveSummary } from "./shared/types";

// Home-page chrome strings. Game titles/descriptions live in games.ts.
MG.i18n.register({
  en: {
    tagline: "A collection of free browser minigames. No installs, no sign-ups — just play.",
    games: "Games",
    empty: "No games yet — check back soon! 🚧",
    made: "Made for fun",
    source: "Source on GitHub",
    lastPlayed: "Last played {date}",
    menu: "Options",
    clearSave: "Clear save data",
    confirmClear: "Delete saved progress for {game}? This can't be undone.",
    "tag.puzzle": "Puzzle",
    "tag.logic": "Logic",
    "tag.arcade": "Arcade",
    "tag.action": "Action",
    "tag.survival": "Survival",
    "tag.casual": "Casual",
    "tag.simulation": "Simulation",
    "tag.racing": "Racing",
  },
  ru: {
    tagline:
      "Коллекция бесплатных браузерных мини-игр. Без установок и регистрации — просто играй.",
    games: "Игры",
    empty: "Игр пока нет — заходи позже! 🚧",
    made: "Сделано для удовольствия",
    source: "Исходники на GitHub",
    lastPlayed: "Последняя игра {date}",
    menu: "Меню",
    clearSave: "Удалить сохранение",
    confirmClear: "Удалить сохранение для {game}? Это нельзя отменить.",
    "tag.puzzle": "Головоломка",
    "tag.logic": "Логика",
    "tag.arcade": "Аркада",
    "tag.action": "Экшен",
    "tag.survival": "Выживание",
    "tag.casual": "Казуальная",
    "tag.simulation": "Симулятор",
    "tag.racing": "Гонки",
  },
  es: {
    tagline:
      "Una colección de minijuegos gratis para el navegador. Sin instalar, sin registros — solo juega.",
    games: "Juegos",
    empty: "Aún no hay juegos — ¡vuelve pronto! 🚧",
    made: "Hecho por diversión",
    source: "Código en GitHub",
    lastPlayed: "Jugado por última vez {date}",
    menu: "Opciones",
    clearSave: "Borrar datos guardados",
    confirmClear: "¿Borrar el progreso guardado de {game}? No se puede deshacer.",
    "tag.puzzle": "Rompecabezas",
    "tag.logic": "Lógica",
    "tag.arcade": "Arcade",
    "tag.action": "Acción",
    "tag.survival": "Supervivencia",
    "tag.casual": "Casual",
    "tag.simulation": "Simulación",
    "tag.racing": "Carreras",
  },
});

const games: Game[] = Array.isArray(GAMES) ? GAMES : [];
const list = document.getElementById("game-list") as HTMLUListElement;
const emptyState = document.getElementById("empty-state") as HTMLParagraphElement;
const langSel = document.getElementById("lang") as HTMLSelectElement;

// The MG.storage name a game uses is its folder name by convention, which is
// the last path segment of its url. Build a lookup from save name → game so a
// card can find its own save (last-played time, clear action).
function saveNameFor(url: string): string {
  const parts = String(url || "")
    .split("/")
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

// Resolve a value that may be a plain string or a { en, ru, es } map.
function localize(value: Localized | undefined): string {
  if (value && typeof value === "object") {
    return value[MG.i18n.lang] || value.en || "";
  }
  return value || "";
}

// Resolve a tag key to its label: prefer the shared `tag.<key>` table, but
// fall back to the key itself so an unregistered tag still renders readably.
function localizeTag(tag: string): string {
  const key = `tag.${tag}`;
  const label = MG.i18n.t(key);
  return label === key ? String(tag) : label;
}

// Order games most-recently-played first (by their save timestamp), keeping
// the registry order as a stable tiebreak for never-played games.
function sortByRecent(items: Game[], saves: Record<string, SaveSummary>): Game[] {
  return items
    .map((game, i) => {
      const save = saves[saveNameFor(game.url)];
      return { game, idx: i, at: save?.savedAt ? save.savedAt : 0 };
    })
    .sort((a, b) => b.at - a.at || a.idx - b.idx)
    .map((x) => x.game);
}

// Build the language selector from the shared list of supported languages.
MG.i18n.SUPPORTED.forEach((lng) => {
  const o = document.createElement("option");
  o.value = lng;
  o.textContent = MG.i18n.LABELS[lng];
  langSel.appendChild(o);
});
langSel.value = MG.i18n.lang;
langSel.addEventListener("change", () => {
  MG.i18n.set(langSel.value);
});

function renderChrome(): void {
  (document.getElementById("tagline") as HTMLElement).textContent = MG.i18n.t("tagline");
  (document.getElementById("games-heading") as HTMLElement).textContent = MG.i18n.t("games");
  emptyState.textContent = MG.i18n.t("empty");
  (document.getElementById("footer-made") as HTMLElement).textContent = MG.i18n.t("made");
  (document.getElementById("footer-source") as HTMLElement).textContent = MG.i18n.t("source");
  langSel.value = MG.i18n.lang;
}

// Fill {placeholder} tokens in a template with values from a map.
function fill(tmpl: string, vars: Record<string, string>): string {
  return String(tmpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

// Render the saved date in the active language; fall back to a raw timestamp.
function formatSavedAt(ts: number | null): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(MG.i18n.lang, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "";
    }
  }
}

// Snapshot of persisted saves, keyed by save name (folder name).
function loadSaves(): Record<string, SaveSummary> {
  const byName: Record<string, SaveSummary> = {};
  const all = MG.storage?.list ? MG.storage.list() : [];
  all.forEach((s) => {
    byName[s.name] = s;
  });
  return byName;
}

interface OpenMenu {
  btn: HTMLButtonElement;
  menu: HTMLDivElement;
}

// Close any open card menu. Re-assigned by renderGames each render so the
// single document-level handler always targets the current DOM.
let closeMenu: () => void = () => {};

function renderGames(): void {
  list.innerHTML = "";
  closeMenu();

  if (games.length === 0) {
    list.hidden = true;
    emptyState.hidden = false;
    return;
  }
  list.hidden = false;
  emptyState.hidden = true;

  const saves = loadSaves();
  let openMenuEl: OpenMenu | null = null;

  closeMenu = () => {
    if (openMenuEl) {
      openMenuEl.menu.hidden = true;
      openMenuEl.btn.setAttribute("aria-expanded", "false");
      openMenuEl = null;
    }
  };

  sortByRecent(games, saves).forEach((game) => {
    const titleText = localize(game.title);
    const save = saves[saveNameFor(game.url)];

    const li = document.createElement("li");
    li.className = "game-card-wrap";

    const card = document.createElement("a");
    card.className = "game-card";
    card.href = game.url;

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = game.icon || "🎮";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = titleText;

    const desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = localize(game.description);

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(desc);

    // Category tags, shown as a row of small chips under the description.
    if (Array.isArray(game.tags) && game.tags.length) {
      const tags = document.createElement("ul");
      tags.className = "game-tags";
      game.tags.forEach((tag) => {
        const chip = document.createElement("li");
        chip.className = "game-tag";
        chip.textContent = localizeTag(tag);
        tags.appendChild(chip);
      });
      card.appendChild(tags);
    }

    // Last-played line, shown only for games with a saved game in this browser.
    if (save) {
      const played = document.createElement("p");
      played.className = "game-played";
      played.textContent = save.savedAt
        ? fill(MG.i18n.t("lastPlayed"), { date: formatSavedAt(save.savedAt) })
        : "";
      if (played.textContent) card.appendChild(played);
    }

    li.appendChild(card);

    // Per-card options menu — only meaningful when there's a save to clear.
    if (save) {
      const menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "card-menu-btn";
      menuBtn.setAttribute("aria-haspopup", "true");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.setAttribute("aria-label", MG.i18n.t("menu"));
      menuBtn.title = MG.i18n.t("menu");
      menuBtn.textContent = "⋯";

      const menu = document.createElement("div");
      menu.className = "card-menu";
      menu.hidden = true;

      const clearItem = document.createElement("button");
      clearItem.type = "button";
      clearItem.className = "card-menu-item card-menu-item--danger";
      clearItem.textContent = MG.i18n.t("clearSave");
      clearItem.addEventListener("click", () => {
        closeMenu();
        const ok = window.confirm(fill(MG.i18n.t("confirmClear"), { game: titleText }));
        if (!ok) return;
        MG.storage.remove(save.name);
        renderGames();
      });

      menu.appendChild(clearItem);

      const ref: OpenMenu = { btn: menuBtn, menu };
      menuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = openMenuEl === ref;
        closeMenu();
        if (!isOpen) {
          menu.hidden = false;
          menuBtn.setAttribute("aria-expanded", "true");
          openMenuEl = ref;
        }
      });

      li.appendChild(menuBtn);
      li.appendChild(menu);
    }

    list.appendChild(li);
  });
}

// One document-level handler closes the open menu on an outside click or Esc.
document.addEventListener("click", () => {
  closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

function render(): void {
  renderChrome();
  renderGames();
}

MG.i18n.onChange(render);
render();

// Home page: renders the game list from window.GAMES and wires up the shared
// language control (MG.i18n). Everything re-renders when the language changes.
(function () {
  "use strict";

  // Home-page chrome strings. Game titles/descriptions live in games.js.
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
    },
    ru: {
      tagline: "Коллекция бесплатных браузерных мини-игр. Без установок и регистрации — просто играй.",
      games: "Игры",
      empty: "Игр пока нет — заходи позже! 🚧",
      made: "Сделано для удовольствия",
      source: "Исходники на GitHub",
      lastPlayed: "Последняя игра {date}",
      menu: "Меню",
      clearSave: "Удалить сохранение",
      confirmClear: "Удалить сохранение для {game}? Это нельзя отменить.",
    },
    es: {
      tagline: "Una colección de minijuegos gratis para el navegador. Sin instalar, sin registros — solo juega.",
      games: "Juegos",
      empty: "Aún no hay juegos — ¡vuelve pronto! 🚧",
      made: "Hecho por diversión",
      source: "Código en GitHub",
      lastPlayed: "Jugado por última vez {date}",
      menu: "Opciones",
      clearSave: "Borrar datos guardados",
      confirmClear: "¿Borrar el progreso guardado de {game}? No se puede deshacer.",
    },
  });

  var games = Array.isArray(window.GAMES) ? window.GAMES : [];
  var list = document.getElementById("game-list");
  var emptyState = document.getElementById("empty-state");
  var langSel = document.getElementById("lang");

  // The MG.storage name a game uses is its folder name by convention, which is
  // the last path segment of its url. Build a lookup from save name → game so a
  // card can find its own save (last-played time, clear action).
  function saveNameFor(url) {
    var parts = String(url || "").split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  // Resolve a value that may be a plain string or a { en, ru, es } map.
  function localize(value) {
    if (value && typeof value === "object") {
      return value[MG.i18n.lang] || value.en || "";
    }
    return value || "";
  }

  // Build the language selector from the shared list of supported languages.
  MG.i18n.SUPPORTED.forEach(function (lng) {
    var o = document.createElement("option");
    o.value = lng;
    o.textContent = MG.i18n.LABELS[lng];
    langSel.appendChild(o);
  });
  langSel.value = MG.i18n.lang;
  langSel.addEventListener("change", function () { MG.i18n.set(langSel.value); });

  function renderChrome() {
    document.getElementById("tagline").textContent = MG.i18n.t("tagline");
    document.getElementById("games-heading").textContent = MG.i18n.t("games");
    emptyState.textContent = MG.i18n.t("empty");
    document.getElementById("footer-made").textContent = MG.i18n.t("made");
    document.getElementById("footer-source").textContent = MG.i18n.t("source");
    langSel.value = MG.i18n.lang;
  }

  // Fill {placeholder} tokens in a template with values from a map.
  function fill(tmpl, vars) {
    return String(tmpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  // Render the saved date in the active language; fall back to a raw timestamp.
  function formatSavedAt(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString(MG.i18n.lang, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      try { return new Date(ts).toLocaleString(); } catch (e2) { return ""; }
    }
  }

  // Snapshot of persisted saves, keyed by save name (folder name).
  function loadSaves() {
    var byName = {};
    var all = (MG.storage && MG.storage.list) ? MG.storage.list() : [];
    all.forEach(function (s) { byName[s.name] = s; });
    return byName;
  }

  // Close any open card menu. Re-assigned by renderGames each render so the
  // single document-level handler always targets the current DOM.
  var closeMenu = function () {};

  function renderGames() {
    list.innerHTML = "";
    closeMenu();

    if (games.length === 0) {
      list.hidden = true;
      emptyState.hidden = false;
      return;
    }
    list.hidden = false;
    emptyState.hidden = true;

    var saves = loadSaves();
    var openMenuEl = null;

    closeMenu = function () {
      if (openMenuEl) {
        openMenuEl.menu.hidden = true;
        openMenuEl.btn.setAttribute("aria-expanded", "false");
        openMenuEl = null;
      }
    };

    games.forEach(function (game) {
      var titleText = localize(game.title);
      var save = saves[saveNameFor(game.url)];

      var li = document.createElement("li");
      li.className = "game-card-wrap";

      var card = document.createElement("a");
      card.className = "game-card";
      card.href = game.url;

      var icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = game.icon || "🎮";

      var title = document.createElement("span");
      title.className = "title";
      title.textContent = titleText;

      var desc = document.createElement("p");
      desc.className = "desc";
      desc.textContent = localize(game.description);

      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(desc);

      // Last-played line, shown only for games with a saved game in this browser.
      if (save) {
        var played = document.createElement("p");
        played.className = "game-played";
        played.textContent = save.savedAt
          ? fill(MG.i18n.t("lastPlayed"), { date: formatSavedAt(save.savedAt) })
          : "";
        if (played.textContent) card.appendChild(played);
      }

      li.appendChild(card);

      // Per-card options menu — only meaningful when there's a save to clear.
      if (save) {
        var menuBtn = document.createElement("button");
        menuBtn.type = "button";
        menuBtn.className = "card-menu-btn";
        menuBtn.setAttribute("aria-haspopup", "true");
        menuBtn.setAttribute("aria-expanded", "false");
        menuBtn.setAttribute("aria-label", MG.i18n.t("menu"));
        menuBtn.title = MG.i18n.t("menu");
        menuBtn.textContent = "⋯";

        var menu = document.createElement("div");
        menu.className = "card-menu";
        menu.hidden = true;

        var clearItem = document.createElement("button");
        clearItem.type = "button";
        clearItem.className = "card-menu-item card-menu-item--danger";
        clearItem.textContent = MG.i18n.t("clearSave");
        clearItem.addEventListener("click", function () {
          closeMenu();
          var ok = window.confirm(fill(MG.i18n.t("confirmClear"), { game: titleText }));
          if (!ok) return;
          MG.storage.remove(save.name);
          renderGames();
        });

        menu.appendChild(clearItem);

        var ref = { btn: menuBtn, menu: menu };
        menuBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var isOpen = openMenuEl === ref;
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
  document.addEventListener("click", function () { closeMenu(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  function render() {
    renderChrome();
    renderGames();
  }

  MG.i18n.onChange(render);
  render();
})();

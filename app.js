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
      saves: "Saved progress",
      savesHint: "Saved in this browser",
      clear: "Clear",
      clearAll: "Clear all",
      savedAt: "Saved {date}",
      confirmClear: "Delete saved progress for {game}? This can't be undone.",
      confirmClearAll: "Delete all saved progress in this browser? This can't be undone.",
    },
    ru: {
      tagline: "Коллекция бесплатных браузерных мини-игр. Без установок и регистрации — просто играй.",
      games: "Игры",
      empty: "Игр пока нет — заходи позже! 🚧",
      made: "Сделано для удовольствия",
      source: "Исходники на GitHub",
      saves: "Сохранения",
      savesHint: "Сохранено в этом браузере",
      clear: "Удалить",
      clearAll: "Удалить всё",
      savedAt: "Сохранено {date}",
      confirmClear: "Удалить сохранение для {game}? Это нельзя отменить.",
      confirmClearAll: "Удалить все сохранения в этом браузере? Это нельзя отменить.",
    },
    es: {
      tagline: "Una colección de minijuegos gratis para el navegador. Sin instalar, sin registros — solo juega.",
      games: "Juegos",
      empty: "Aún no hay juegos — ¡vuelve pronto! 🚧",
      made: "Hecho por diversión",
      source: "Código en GitHub",
      saves: "Progreso guardado",
      savesHint: "Guardado en este navegador",
      clear: "Borrar",
      clearAll: "Borrar todo",
      savedAt: "Guardado {date}",
      confirmClear: "¿Borrar el progreso guardado de {game}? No se puede deshacer.",
      confirmClearAll: "¿Borrar todo el progreso guardado en este navegador? No se puede deshacer.",
    },
  });

  var games = Array.isArray(window.GAMES) ? window.GAMES : [];
  var list = document.getElementById("game-list");
  var emptyState = document.getElementById("empty-state");
  var langSel = document.getElementById("lang");
  var savesSection = document.getElementById("saves-section");
  var savesHeading = document.getElementById("saves-heading");
  var savesList = document.getElementById("saves-list");
  var savesClearAll = document.getElementById("saves-clear-all");

  // The MG.storage name a game uses is its folder name by convention, which is
  // the last path segment of its url. Build a lookup from save name → game so
  // the save manager can show each save with the right icon and title.
  function saveNameFor(url) {
    var parts = String(url || "").split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }
  var gameBySaveName = {};
  games.forEach(function (g) {
    var name = saveNameFor(g.url);
    if (name) gameBySaveName[name] = g;
  });

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

  function renderGames() {
    list.innerHTML = "";

    if (games.length === 0) {
      list.hidden = true;
      emptyState.hidden = false;
      return;
    }
    list.hidden = false;
    emptyState.hidden = true;

    games.forEach(function (game) {
      var li = document.createElement("li");

      var card = document.createElement("a");
      card.className = "game-card";
      card.href = game.url;

      var icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = game.icon || "🎮";

      var title = document.createElement("span");
      title.className = "title";
      title.textContent = localize(game.title);

      var desc = document.createElement("p");
      desc.className = "desc";
      desc.textContent = localize(game.description);

      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(desc);
      li.appendChild(card);
      list.appendChild(li);
    });
  }

  function render() {
    renderChrome();
    renderGames();
    renderSaves();
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

  function renderSaves() {
    var saves = (MG.storage && MG.storage.list) ? MG.storage.list() : [];
    savesList.innerHTML = "";

    if (!saves.length) {
      savesSection.hidden = true;
      return;
    }
    savesSection.hidden = false;
    savesHeading.textContent = MG.i18n.t("saves");
    savesClearAll.textContent = MG.i18n.t("clearAll");

    saves.forEach(function (s) {
      var game = gameBySaveName[s.name];
      var titleText = game ? localize(game.title) : s.name;

      var li = document.createElement("li");
      li.className = "save-row";

      var icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = (game && game.icon) || "💾";

      var info = document.createElement("div");
      info.className = "save-info";

      var title = document.createElement("span");
      title.className = "save-title";
      title.textContent = titleText;

      var meta = document.createElement("span");
      meta.className = "save-meta";
      meta.textContent = s.savedAt
        ? fill(MG.i18n.t("savedAt"), { date: formatSavedAt(s.savedAt) })
        : MG.i18n.t("savesHint");

      info.appendChild(title);
      info.appendChild(meta);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "saves-btn";
      btn.textContent = MG.i18n.t("clear");
      btn.addEventListener("click", function () {
        var ok = window.confirm(fill(MG.i18n.t("confirmClear"), { game: titleText }));
        if (!ok) return;
        MG.storage.remove(s.name);
        renderSaves();
      });

      li.appendChild(icon);
      li.appendChild(info);
      li.appendChild(btn);
      savesList.appendChild(li);
    });
  }

  savesClearAll.addEventListener("click", function () {
    if (!window.confirm(MG.i18n.t("confirmClearAll"))) return;
    MG.storage.clearAll();
    renderSaves();
  });

  MG.i18n.onChange(render);
  render();
})();

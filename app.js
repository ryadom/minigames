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
    },
    ru: {
      tagline: "Коллекция бесплатных браузерных мини-игр. Без установок и регистрации — просто играй.",
      games: "Игры",
      empty: "Игр пока нет — заходи позже! 🚧",
      made: "Сделано для удовольствия",
      source: "Исходники на GitHub",
    },
    es: {
      tagline: "Una colección de minijuegos gratis para el navegador. Sin instalar, sin registros — solo juega.",
      games: "Juegos",
      empty: "Aún no hay juegos — ¡vuelve pronto! 🚧",
      made: "Hecho por diversión",
      source: "Código en GitHub",
    },
  });

  var games = Array.isArray(window.GAMES) ? window.GAMES : [];
  var list = document.getElementById("game-list");
  var emptyState = document.getElementById("empty-state");
  var langSel = document.getElementById("lang");

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
  }

  MG.i18n.onChange(render);
  render();
})();

// Renders the game list on the home page from the window.GAMES registry.
(function () {
  "use strict";

  var games = Array.isArray(window.GAMES) ? window.GAMES : [];
  var list = document.getElementById("game-list");
  var emptyState = document.getElementById("empty-state");

  if (games.length === 0) {
    list.hidden = true;
    emptyState.hidden = false;
    return;
  }

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
    title.textContent = game.title;

    var desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = game.description || "";

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(desc);
    li.appendChild(card);
    list.appendChild(li);
  });
})();

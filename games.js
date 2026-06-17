/**
 * Registry of available minigames.
 *
 * To add a new game, create a folder for it (e.g. ./games/snake/index.html)
 * and append an entry below:
 *
 *   {
 *     title: "Snake",
 *     description: "Eat, grow, don't bite yourself.",
 *     icon: "🐍",
 *     url: "./games/snake/",
 *   }
 *
 * The list on the home page is generated automatically from this array.
 */
window.GAMES = [
  {
    title: "Minesweeper",
    description: "Infinite, pannable, zoomable Minesweeper — clear an endless field.",
    icon: "💣",
    url: "./games/minesweeper/",
  },
  {
    title: "Flappy Bird",
    description: "Tap, click or press space to flap through the pipes — don't crash.",
    icon: "🐤",
    url: "./games/flappy-bird/",
  },
];

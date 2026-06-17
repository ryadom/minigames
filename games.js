/**
 * Registry of available minigames.
 *
 * To add a new game, create a folder for it (e.g. ./games/snake/index.html)
 * and append an entry below:
 *
 *   {
 *     title: "Snake",
 *     icon: "🐍",
 *     url: "./games/snake/",
 *     // `description` may be a plain string or a { en, ru, es } map.
 *     description: {
 *       en: "Eat, grow, don't bite yourself.",
 *       ru: "Ешь, расти, не кусай себя.",
 *       es: "Come, crece, no te muerdas.",
 *     },
 *   }
 *
 * Descriptions are resolved to the active language by app.js (via MG.i18n);
 * a plain string is shown as-is in every language.
 *
 * The list on the home page is generated automatically from this array.
 */
window.GAMES = [
  {
    title: "Minesweeper",
    icon: "💣",
    url: "./games/minesweeper/",
    description: {
      en: "Infinite, pannable, zoomable Minesweeper — clear an endless field.",
      ru: "Бесконечный сапёр — двигай и масштабируй бескрайнее поле.",
      es: "Buscaminas infinito — despeja un campo sin fin que puedes mover y ampliar.",
    },
  },
  {
    title: "Flappy Bird",
    icon: "🐤",
    url: "./games/flappy-bird/",
    description: {
      en: "Tap, click or press space to flap through the pipes — don't crash.",
      ru: "Тап, клик или пробел — взмахни и пролетай сквозь трубы, не разбейся.",
      es: "Toca, clic o espacio para aletear entre las tuberías — no choques.",
    },
  },
  {
    title: "Night Survivors",
    icon: "🧛",
    url: "./games/vampire-survivors/",
    description: {
      en: "Move and let your weapons auto-fire — survive the endless horde, grab XP and level up.",
      ru: "Двигайся, а оружие стреляет само — переживи бесконечную орду, собирай опыт и качайся.",
      es: "Muévete y deja que tus armas disparen solas — sobrevive a la horda, junta XP y sube de nivel.",
    },
  },
  {
    title: "Match Three",
    icon: "💎",
    url: "./games/match-three/",
    description: {
      en: "Swap gems to line up 3+ — forge rockets, bombs and rainbow blasts to clear the board.",
      ru: "Меняй камни местами и собирай 3+ в ряд — создавай ракеты, бомбы и радужные взрывы.",
      es: "Intercambia gemas para alinear 3+ — crea cohetes, bombas y explosiones arcoíris.",
    },
  },
];

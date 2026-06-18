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
 *     // `tags` are short category keys, localized on the home page (app.js)
 *     // from the shared `tag.<key>` string tables — add new keys there.
 *     tags: ["arcade", "action"],
 *     // `description` may be a plain string or a { en, ru, es } map.
 *     description: {
 *       en: "Eat, grow, don't bite yourself.",
 *       ru: "Ешь, расти, не кусай себя.",
 *       es: "Come, crece, no te muerdas.",
 *     },
 *   }
 *
 * Descriptions are resolved to the active language by app.js (via MG.i18n);
 * a plain string is shown as-is in every language. Tags are likewise localized
 * by app.js via their `tag.<key>` entries.
 *
 * The list on the home page is generated automatically from this array.
 */
window.GAMES = [
  {
    title: "Minesweeper",
    icon: "💣",
    url: "./games/minesweeper/",
    tags: ["puzzle", "logic"],
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
    tags: ["arcade", "action"],
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
    tags: ["action", "survival"],
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
    tags: ["puzzle", "casual"],
    description: {
      en: "Swap gems to line up 3+ — forge rockets, bombs and rainbow blasts to clear the board.",
      ru: "Меняй камни местами и собирай 3+ в ряд — создавай ракеты, бомбы и радужные взрывы.",
      es: "Intercambia gemas para alinear 3+ — crea cohetes, bombas y explosiones arcoíris.",
    },
  },
  {
    title: "Sudoku",
    icon: "🔢",
    url: "./games/sudoku/",
    tags: ["puzzle", "logic"],
    description: {
      en: "Classic 9×9 Sudoku — pick easy, medium, hard or expert and fill the grid.",
      ru: "Классическое судоку 9×9 — выбери уровень от лёгкого до эксперта и заполни сетку.",
      es: "Sudoku clásico 9×9 — elige fácil, medio, difícil o experto y completa la cuadrícula.",
    },
  },
  {
    title: "Killer Sudoku",
    icon: "🗡️",
    url: "./games/killer-sudoku/",
    tags: ["puzzle", "logic"],
    description: {
      en: "Killer Sudoku — no givens, just dashed cages with target sums to add up. Pick easy to expert.",
      ru: "Киллер-судоку — без подсказок, только пунктирные клетки с суммами. Уровни от лёгкого до эксперта.",
      es: "Killer Sudoku — sin pistas, solo jaulas punteadas con sumas objetivo. Elige de fácil a experto.",
    },
  },
  {
    title: "Farm",
    icon: "🚜",
    url: "./games/farm/",
    tags: ["simulation", "casual"],
    description: {
      en: "Buy seeds, plant, water and harvest crops for coins — your little farm grows in real time.",
      ru: "Покупай семена, сажай, поливай и собирай урожай за монеты — ферма растёт в реальном времени.",
      es: "Compra semillas, planta, riega y cosecha cultivos por monedas — tu granja crece en tiempo real.",
    },
  },
  {
    title: "2048",
    icon: "🔢",
    url: "./games/2048/",
    tags: ["puzzle", "casual"],
    description: {
      en: "Slide the tiles, merge matching numbers and reach 2048 — arrow keys or swipe.",
      ru: "Двигай плитки, объединяй одинаковые числа и собери 2048 — стрелки или свайп.",
      es: "Desliza las fichas, une los números iguales y llega a 2048 — flechas o desliza.",
    },
  },
  {
    title: "Racing",
    icon: "🏎️",
    url: "./games/racing/",
    tags: ["racing", "action"],
    description: {
      en: "3D racing — steer through curves and hills, dodge the traffic and chase your best distance.",
      ru: "3D-гонки — рули по поворотам и холмам, уворачивайся от трафика и побей свой рекорд дистанции.",
      es: "Carreras en 3D — gira por curvas y colinas, esquiva el tráfico y supera tu mejor distancia.",
    },
  },
  {
    title: "Top Racer",
    icon: "🏁",
    url: "./games/top-racer/",
    tags: ["racing", "arcade"],
    description: {
      en: "Top-down racing — steer your car around the circuit, hit the racing line and chase your best lap.",
      ru: "Гонки сверху — рули по трассе, держи идеальную траекторию и побей свой лучший круг.",
      es: "Carreras desde arriba — conduce por el circuito, busca la trazada y bate tu mejor vuelta.",
    },
  },
];

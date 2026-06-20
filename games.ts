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
 *     // `tags` are short category keys, localized on the home page (app.ts)
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
 * Descriptions are resolved to the active language by app.ts (via MG.i18n);
 * a plain string is shown as-is in every language. Tags are likewise localized
 * by app.ts via their `tag.<key>` entries.
 *
 * The list on the home page is generated automatically from this array.
 */
import type { Lang } from "./shared/types";

/** A value shown to the player that may be a plain string or a per-language map. */
export type Localized = string | Partial<Record<Lang, string>>;

/** One entry in the home-page game registry. */
export interface Game {
  title: Localized;
  icon: string;
  url: string;
  /** Short category keys, localized on the home page via `tag.<key>`. */
  tags?: string[];
  description?: Localized;
}

export const GAMES: Game[] = [
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
    title: "Snake",
    icon: "🐍",
    url: "./games/snake/",
    tags: ["arcade", "action"],
    description: {
      en: "Eat the apples, grow longer and don't bite yourself — arrow keys, WASD or swipe.",
      ru: "Ешь яблоки, расти и не кусай себя — стрелки, WASD или свайп.",
      es: "Come las manzanas, crece y no te muerdas — flechas, WASD o desliza.",
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
      en: "Build a farm on a tile grid — place soil, shops & pens, grow crops, raise animals, cook dishes, fill orders, trade and level up.",
      ru: "Строй ферму на сетке — ставь грядки, лавки и загоны, выращивай урожай, держи животных, готовь блюда, выполняй заказы и качай уровень.",
      es: "Construye una granja en una cuadrícula — coloca tierra, tiendas y corrales, cultiva, cría animales, cocina, completa pedidos y sube de nivel.",
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
    title: "Mini Craft",
    icon: "⛏️",
    url: "./games/minecraft/",
    tags: ["simulation", "casual"],
    description: {
      en: "A first-person 3D voxel sandbox — mine blocks that drop into your inventory, craft tools, and build in a blocky world.",
      ru: "Воксельная 3D-песочница от первого лица — копай блоки, собирай их в инвентарь, создавай инструменты и строй в кубическом мире.",
      es: "Un sandbox de vóxeles 3D en primera persona — pica bloques que caen a tu inventario, fabrica herramientas y construye en un mundo de cubos.",
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
    title: "Solitaire",
    icon: "🃏",
    url: "./games/solitaire/",
    description: {
      en: "Klondike Solitaire — build the foundations up from Ace to King. Draw 1 or 3, undo and auto-finish.",
      ru: "Косынка (Клондайк) — собирай стопки от туза до короля. Тяни по 1 или 3, отменяй ходы и авто-сбор.",
      es: "Solitario Klondike — construye las bases del As al Rey. Roba 1 o 3, deshaz y autocompleta.",
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

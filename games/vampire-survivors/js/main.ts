import { MG } from "../../../shared/mg";
import type { HeaderUI } from "../../../shared/types";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/* ============================ i18n ============================ */
MG.i18n.register({
  en: {
    title: "Night Survivors",
    time: "Time",
    level: "Lv",
    kills: "Kills",
    hint: "Move with WASD / arrows or drag. Your weapons fire on their own — survive the horde and level up.",
    start: "▶ Start",
    gameover: "You Died",
    survivedLabel: "Survived",
    levelLabel: "Level",
    killsLabel: "Kills",
    playAgain: "▶ Play again",
    levelup: "Level Up!",
    choose: "Choose an upgrade",
    paused: "Paused",
    resume: "▶ Resume",
    newBadge: "NEW",
    lvlBadge: "Lv {n}",
    maxBadge: "MAX",
    // header actions + wiki
    pauseBtn: "Pause",
    wiki: "Guide",
    wikiTitle: "Survival Guide",
    secWeapons: "Weapons",
    secPassives: "Power-ups",
    secEnemies: "Bestiary",
    close: "✕ Close",
    unlockAt: "from {t}",
    // loadout / stats screen
    loadout: "Loadout",
    loadoutTitle: "Loadout & Stats",
    secStats: "Stats",
    secOwnedWeapons: "Your weapons",
    secOwnedPassives: "Your power-ups",
    st_hp: "Health",
    st_speed: "Move speed",
    st_pickup: "Pickup range",
    st_regen: "Regen",
    st_power: "Damage",
    st_time: "Time",
    loadoutEmpty: "Nothing yet — start a run to build your loadout.",
    // weapons + upgrades
    w_knife: "Dagger",
    w_knife_d: "Throws a dagger toward the nearest foe.",
    w_aura: "Garlic Aura",
    w_aura_d: "A holy ring that burns nearby enemies.",
    w_bolt: "Magic Bolt",
    w_bolt_d: "Homing bolts seek out enemies.",
    w_whip: "Whip",
    w_whip_d: "Slashes a wide arc to your sides.",
    w_lightning: "Lightning",
    w_lightning_d: "Smites random enemies with bolts from the sky.",
    w_fire: "Firebomb",
    w_fire_d: "Lobs a bomb that explodes in a fiery blast.",
    w_frost: "Frost Shard",
    w_frost_d: "Pierces enemies and chills them, slowing them down.",
    w_orb: "Spirit Orbs",
    w_orb_d: "Orbiting orbs that shield you and strike foes.",
    w_axe: "War Axe",
    w_axe_d: "Hurls heavy, piercing axes in a high arc.",
    u_speed: "Swift Boots",
    u_speed_d: "+12% move speed.",
    u_health: "Vitality",
    u_health_d: "+20 max HP and heal up.",
    u_magnet: "Magnet",
    u_magnet_d: "+40% pickup range.",
    u_regen: "Regeneration",
    u_regen_d: "Slowly recover HP over time.",
    u_power: "Might",
    u_power_d: "+15% all weapon damage.",
    // enemies (bestiary)
    e_bat: "Bat",
    e_bat_d: "A weak flier that swarms in numbers.",
    e_zombie: "Zombie",
    e_zombie_d: "Slow but sturdy and hits hard.",
    e_ghost: "Ghost",
    e_ghost_d: "Quick and flighty — hard to pin down.",
    e_skull: "Skull",
    e_skull_d: "Tough bonehead with a nasty bite.",
    e_demon: "Demon",
    e_demon_d: "Brutal hulk with heaps of health.",
    e_spider: "Spider",
    e_spider_d: "Tiny and very fast — comes in droves.",
    e_imp: "Imp",
    e_imp_d: "Erratic darter that closes in fast.",
    e_werewolf: "Werewolf",
    e_werewolf_d: "Fast bruiser that rushes you down.",
    e_troll: "Troll",
    e_troll_d: "A slow wall of health and heavy hits.",
    e_dragon: "Dragon",
    e_dragon_d: "Late-game terror — immense health and damage.",
  },
  ru: {
    title: "Ночные выживальщики",
    time: "Время",
    level: "Ур",
    kills: "Убийства",
    hint: "Двигайся на WASD / стрелках или перетаскивай. Оружие стреляет само — переживи орду и качайся.",
    start: "▶ Начать",
    gameover: "Вы погибли",
    survivedLabel: "Продержался",
    levelLabel: "Уровень",
    killsLabel: "Убийства",
    playAgain: "▶ Ещё раз",
    levelup: "Новый уровень!",
    choose: "Выберите улучшение",
    paused: "Пауза",
    resume: "▶ Продолжить",
    newBadge: "НОВОЕ",
    lvlBadge: "Ур {n}",
    maxBadge: "МАКС",
    pauseBtn: "Пауза",
    wiki: "Гид",
    wikiTitle: "Гид по выживанию",
    secWeapons: "Оружие",
    secPassives: "Усиления",
    secEnemies: "Бестиарий",
    close: "✕ Закрыть",
    unlockAt: "с {t}",
    loadout: "Снаряжение",
    loadoutTitle: "Снаряжение и статы",
    secStats: "Статы",
    secOwnedWeapons: "Ваше оружие",
    secOwnedPassives: "Ваши усиления",
    st_hp: "Здоровье",
    st_speed: "Скорость",
    st_pickup: "Радиус подбора",
    st_regen: "Регенерация",
    st_power: "Урон",
    st_time: "Время",
    loadoutEmpty: "Пока пусто — начните забег, чтобы собрать снаряжение.",
    w_knife: "Кинжал",
    w_knife_d: "Бросает кинжал в ближайшего врага.",
    w_aura: "Аура чеснока",
    w_aura_d: "Святое кольцо жжёт врагов рядом.",
    w_bolt: "Магострела",
    w_bolt_d: "Самонаводящиеся снаряды ищут врагов.",
    w_whip: "Кнут",
    w_whip_d: "Рассекает широкой дугой по бокам.",
    w_lightning: "Молния",
    w_lightning_d: "Бьёт случайных врагов молниями с неба.",
    w_fire: "Огнебомба",
    w_fire_d: "Бросает бомбу, взрывающуюся огнём.",
    w_frost: "Ледяной осколок",
    w_frost_d: "Пробивает врагов и замораживает, замедляя их.",
    w_orb: "Духовные сферы",
    w_orb_d: "Сферы вращаются вокруг, защищая и раня врагов.",
    w_axe: "Боевой топор",
    w_axe_d: "Метает тяжёлые пробивающие топоры по дуге.",
    u_speed: "Быстрые сапоги",
    u_speed_d: "+12% к скорости.",
    u_health: "Живучесть",
    u_health_d: "+20 к макс. HP и лечение.",
    u_magnet: "Магнит",
    u_magnet_d: "+40% к радиусу подбора.",
    u_regen: "Регенерация",
    u_regen_d: "Медленно восстанавливает HP.",
    u_power: "Мощь",
    u_power_d: "+15% к урону всего оружия.",
    e_bat: "Летучая мышь",
    e_bat_d: "Слабая летунья, нападает стаями.",
    e_zombie: "Зомби",
    e_zombie_d: "Медленный, но крепкий и больно бьёт.",
    e_ghost: "Призрак",
    e_ghost_d: "Быстрый и юркий — трудно поймать.",
    e_skull: "Череп",
    e_skull_d: "Крепкий костяк с злым укусом.",
    e_demon: "Демон",
    e_demon_d: "Громила с огромным запасом HP.",
    e_spider: "Паук",
    e_spider_d: "Маленький и очень быстрый — лезет ордой.",
    e_imp: "Бес",
    e_imp_d: "Дёрганый шустрик, быстро сближается.",
    e_werewolf: "Оборотень",
    e_werewolf_d: "Быстрый громила, бросается в атаку.",
    e_troll: "Тролль",
    e_troll_d: "Медленная стена HP и тяжёлых ударов.",
    e_dragon: "Дракон",
    e_dragon_d: "Кошмар поздней игры — огромные HP и урон.",
  },
  es: {
    title: "Sobrevivientes Nocturnos",
    time: "Tiempo",
    level: "Nv",
    kills: "Bajas",
    hint: "Muévete con WASD / flechas o arrastra. Tus armas disparan solas — sobrevive a la horda y sube de nivel.",
    start: "▶ Empezar",
    gameover: "Has Muerto",
    survivedLabel: "Sobreviviste",
    levelLabel: "Nivel",
    killsLabel: "Bajas",
    playAgain: "▶ Jugar otra vez",
    levelup: "¡Subiste de nivel!",
    choose: "Elige una mejora",
    paused: "Pausa",
    resume: "▶ Continuar",
    newBadge: "NUEVO",
    lvlBadge: "Nv {n}",
    maxBadge: "MÁX",
    pauseBtn: "Pausa",
    wiki: "Guía",
    wikiTitle: "Guía de supervivencia",
    secWeapons: "Armas",
    secPassives: "Mejoras",
    secEnemies: "Bestiario",
    close: "✕ Cerrar",
    unlockAt: "desde {t}",
    loadout: "Equipo",
    loadoutTitle: "Equipo y estadísticas",
    secStats: "Estadísticas",
    secOwnedWeapons: "Tus armas",
    secOwnedPassives: "Tus mejoras",
    st_hp: "Salud",
    st_speed: "Velocidad",
    st_pickup: "Rango de recogida",
    st_regen: "Regeneración",
    st_power: "Daño",
    st_time: "Tiempo",
    loadoutEmpty: "Nada aún — inicia una partida para armar tu equipo.",
    w_knife: "Daga",
    w_knife_d: "Lanza una daga al enemigo más cercano.",
    w_aura: "Aura de Ajo",
    w_aura_d: "Un anillo sagrado quema a los cercanos.",
    w_bolt: "Rayo Mágico",
    w_bolt_d: "Rayos teledirigidos buscan enemigos.",
    w_whip: "Látigo",
    w_whip_d: "Corta un arco amplio a tus lados.",
    w_lightning: "Rayo",
    w_lightning_d: "Fulmina a enemigos al azar con rayos del cielo.",
    w_fire: "Bomba de Fuego",
    w_fire_d: "Lanza una bomba que estalla en llamas.",
    w_frost: "Esquirla Helada",
    w_frost_d: "Atraviesa y congela a los enemigos, ralentizándolos.",
    w_orb: "Orbes Espirituales",
    w_orb_d: "Orbes que giran a tu alrededor y golpean.",
    w_axe: "Hacha de Guerra",
    w_axe_d: "Lanza hachas pesadas y perforantes en un arco.",
    u_speed: "Botas Veloces",
    u_speed_d: "+12% de velocidad.",
    u_health: "Vitalidad",
    u_health_d: "+20 HP máx. y curación.",
    u_magnet: "Imán",
    u_magnet_d: "+40% de rango de recogida.",
    u_regen: "Regeneración",
    u_regen_d: "Recupera HP lentamente.",
    u_power: "Poder",
    u_power_d: "+15% de daño de todas las armas.",
    e_bat: "Murciélago",
    e_bat_d: "Volador débil que ataca en enjambre.",
    e_zombie: "Zombi",
    e_zombie_d: "Lento pero resistente y pega fuerte.",
    e_ghost: "Fantasma",
    e_ghost_d: "Rápido y escurridizo — difícil de fijar.",
    e_skull: "Calavera",
    e_skull_d: "Hueso duro con una mordida fea.",
    e_demon: "Demonio",
    e_demon_d: "Mole brutal con montones de vida.",
    e_spider: "Araña",
    e_spider_d: "Diminuta y velocísima — llega en masa.",
    e_imp: "Diablillo",
    e_imp_d: "Errático y veloz, se acerca rápido.",
    e_werewolf: "Hombre Lobo",
    e_werewolf_d: "Bruto veloz que se lanza sobre ti.",
    e_troll: "Trol",
    e_troll_d: "Un muro lento de vida y golpes pesados.",
    e_dragon: "Dragón",
    e_dragon_d: "Terror del final — vida y daño inmensos.",
  },
});
const T = (key: string): string => MG.i18n.t(key);

/* ====================== game data types ====================== */
interface Vec {
  x: number;
  y: number;
}

interface Player {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  xp: number;
  level: number;
  xpNeed: number;
  pickup: number;
  regen: number;
  power: number;
  dir: Vec;
  hurtFlash: number;
  weapons: Record<string, number>;
  passives: Record<string, number>;
  fireTimers: Record<string, number>;
}

interface WeaponDef {
  icon: string;
  nameKey: string;
  descKey: string;
  max: number;
  cooldown: (l: number) => number;
  fire: (p: Player) => void;
}

interface PassiveDef {
  icon: string;
  nameKey: string;
  descKey: string;
  max: number;
  apply: (p: Player) => void;
}

interface ProjExplode {
  radius: number;
  dmg: number;
}

interface ProjSlow {
  dur: number;
  factor: number;
}

interface ProjOrbit {
  angle: number;
  radius: number;
  speed: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  color: string;
  life: number;
  pierce: number;
  homing: boolean;
  hitSet: Enemy[] | null;
  emoji?: string;
  spin?: number;
  gravity?: number;
  angle?: number;
  explode?: ProjExplode;
  slow?: ProjSlow;
  orbit?: ProjOrbit;
  rehit?: number;
  rehitTimer?: number;
}

interface EnemyType {
  id: string;
  emoji: string;
  r: number;
  hp: number;
  speed: number;
  dmg: number;
  xp: number;
  color: string;
  from: number;
  escale?: number;
}

interface Enemy {
  type: EnemyType;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  xp: number;
  color: string;
  emoji: string;
  escale: number;
  flash: number;
  slow: number;
  knock: Vec;
}

interface Gem {
  x: number;
  y: number;
  value: number;
  r: number;
  vx: number;
  vy: number;
  born: number;
}

interface ZapSeg {
  x: number;
  y: number;
}

interface SlashParticle {
  kind: "slash";
  x: number;
  y: number;
  life: number;
  max: number;
  base: number;
  reach: number;
  arc: number;
}

interface RingParticle {
  kind: "ring";
  x: number;
  y: number;
  life: number;
  max: number;
  radius: number;
  color: string;
}

interface ZapParticle {
  kind: "zap";
  x: number;
  y: number;
  life: number;
  max: number;
  segs: ZapSeg[];
}

interface SparkParticle {
  kind: "spark";
  x: number;
  y: number;
  life: number;
  max: number;
  vx: number;
  vy: number;
  color: string;
}

type Particle = SlashParticle | RingParticle | ZapParticle | SparkParticle;

interface Choice {
  kind: "weapon" | "passive";
  id: string;
  lvl: number;
  def: WeaponDef | PassiveDef;
  isNew: boolean;
}

/* ======================== canvas / view ======================== */
const canvas = $<HTMLCanvasElement>("game");
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const overlay = $("overlay");
const panel = $("panel");
const xpfill = $("xpfill");
const hudTime = $("hud-time");
const hudSub = $("hud-sub");

const ui: HeaderUI = MG.mountHeader({
  icon: "🧛",
  titleKey: "title",
  stats: [
    { key: "time", labelKey: "time", variant: "sm", value: "0:00" },
    { key: "lvl", labelKey: "level", value: "1" },
    { key: "hp", labelKey: "kills", variant: "alert", value: "0" },
  ],
  actions: [
    {
      key: "loadout",
      labelKey: "loadout",
      onClick: () => {
        toggleLoadout();
      },
    },
    {
      key: "wiki",
      labelKey: "wiki",
      onClick: () => {
        toggleWiki();
      },
    },
    {
      key: "pause",
      labelKey: "pauseBtn",
      onClick: () => {
        togglePause();
      },
    },
  ],
});
// Repurpose the third chip as a kills counter with an alert look.
// (labelKey above is "kills" — the alert variant just makes it pop.)

let W = 0;
let H = 0;
let dpr = 1;
function resize(): void {
  const rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

/* ============================ state ============================ */
const STATE_READY = 0;
const STATE_PLAY = 1;
const STATE_LEVELUP = 2;
const STATE_DEAD = 3;
const STATE_PAUSE = 4;
const STATE_WIKI = 5;
const STATE_LOADOUT = 6;
let state = STATE_READY;
let wikiReturn = STATE_READY; // state to restore when the wiki closes
let loadoutReturn = STATE_READY; // state to restore when the loadout closes

let player: Player;
let enemies: Enemy[];
let projectiles: Projectile[];
let gems: Gem[];
let particles: Particle[];
let _hazards: unknown[];
let elapsed: number;
let kills: number;
let spawnTimer: number;
let lastTime: number;
let camX: number;
let camY: number;
let _slowMo: number;
// Shared versioned save store (see MG.storage in shared/mg.js).
const store = MG.storage<{ best: number }>("vampire-survivors", { version: 1 });
let best = (store.load() || { best: 0 }).best;

// --- Player + weapon/upgrade model ---
// Weapons & passive upgrades share a "level" so a single roster covers
// the level-up screen. Weapons have a fire() driven by their own timer.
function defaultPlayer(): Player {
  return {
    x: 0,
    y: 0,
    r: 13,
    hp: 100,
    maxHp: 100,
    speed: 165, // px / sec
    xp: 0,
    level: 1,
    xpNeed: 5,
    pickup: 70, // gem attraction radius
    regen: 0, // hp / sec
    power: 1, // global damage multiplier
    dir: { x: 0, y: 1 }, // last move direction (for whip/aim)
    hurtFlash: 0,
    weapons: {}, // id -> level
    passives: {}, // id -> level
    fireTimers: {}, // id -> seconds until next shot
  };
}

// ------------- Weapon definitions -------------
// Each: max level, cooldown(level), and a fire(p, dt) that spawns attacks.
const WEAPONS: Record<string, WeaponDef> = {
  knife: {
    icon: "🗡️",
    nameKey: "w_knife",
    descKey: "w_knife_d",
    max: 6,
    cooldown: (l) => {
      return Math.max(0.18, 0.62 - l * 0.06);
    },
    fire: (p) => {
      const n = 1 + Math.floor(l(p, "knife") / 2); // extra knives every 2 levels
      const targets = nearestEnemies(p.x, p.y, n);
      const dmg = (8 + l(p, "knife") * 3) * p.power;
      for (let i = 0; i < n; i++) {
        const t = targets[i];
        const ang = t
          ? Math.atan2(t.y - p.y, t.x - p.x)
          : Math.atan2(p.dir.y, p.dir.x) + (i - n / 2) * 0.25;
        projectiles.push(mkProj(p.x, p.y, ang, 360, dmg, 6, "#ffe9a8", 1.4, false));
      }
    },
  },
  bolt: {
    icon: "✨",
    nameKey: "w_bolt",
    descKey: "w_bolt_d",
    max: 6,
    cooldown: (l) => {
      return Math.max(0.45, 1.4 - l * 0.14);
    },
    fire: (p) => {
      const n = 1 + Math.floor((l(p, "bolt") - 1) / 2);
      const targets = nearestEnemies(p.x, p.y, n + 2);
      const dmg = (14 + l(p, "bolt") * 5) * p.power;
      for (let i = 0; i < n; i++) {
        const t = targets[i] || targets[0];
        const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.random() * 6.28;
        const pr = mkProj(p.x, p.y, ang, 240, dmg, 7, "#9be7ff", 2.4, false);
        pr.homing = true;
        projectiles.push(pr);
      }
    },
  },
  whip: {
    icon: "〰️",
    nameKey: "w_whip",
    descKey: "w_whip_d",
    max: 6,
    cooldown: (l) => {
      return Math.max(0.4, 1.0 - l * 0.08);
    },
    fire: (p) => {
      const dmg = (12 + l(p, "whip") * 4) * p.power;
      const reach = 120 + l(p, "whip") * 12;
      // Slash to the facing side and its opposite (level 3+).
      const base = p.dir.x >= 0 ? 0 : Math.PI;
      spawnSlash(p, base, reach, dmg);
      if (l(p, "whip") >= 3) spawnSlash(p, base + Math.PI, reach, dmg);
    },
  },
  aura: {
    icon: "🧄",
    nameKey: "w_aura",
    descKey: "w_aura_d",
    max: 6,
    cooldown: () => {
      return 0.5;
    }, // ticks twice a second
    fire: (p) => {
      const lvl = l(p, "aura");
      const radius = 60 + lvl * 12;
      const dmg = (5 + lvl * 2) * p.power;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy < radius * radius) {
          hitEnemy(e, dmg, dx, dy, 40);
        }
      }
      spawnRing(p.x, p.y, radius, "#c8ff9b");
    },
  },
  lightning: {
    icon: "⚡",
    nameKey: "w_lightning",
    descKey: "w_lightning_d",
    max: 6,
    cooldown: (lv) => {
      return Math.max(0.7, 1.9 - lv * 0.2);
    },
    fire: (p) => {
      const lvl = l(p, "lightning");
      const n = 1 + Math.floor((lvl + 1) / 2); // strikes per cast
      const dmg = (16 + lvl * 6) * p.power;
      // Prefer enemies on-screen so the player sees the smites.
      const pool = nearestEnemies(p.x, p.y, n * 4);
      for (let i = 0; i < n && pool.length; i++) {
        const t = pool[Math.floor(Math.random() * pool.length)];
        hitEnemy(t, dmg, 0, -1, 30);
        spawnZap(t.x, t.y);
      }
    },
  },
  fire: {
    icon: "🔥",
    nameKey: "w_fire",
    descKey: "w_fire_d",
    max: 6,
    cooldown: (lv) => {
      return Math.max(0.85, 2.1 - lv * 0.18);
    },
    fire: (p) => {
      const lvl = l(p, "fire");
      const t = nearestEnemies(p.x, p.y, 1)[0];
      const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.dir.y, p.dir.x);
      const pr = mkProj(p.x, p.y, ang, 230, 0, 9, "#ff8a3c", 0.9, false);
      pr.emoji = "💣";
      pr.spin = 8;
      pr.gravity = 260;
      pr.vy -= 120;
      pr.explode = { radius: 64 + lvl * 10, dmg: (20 + lvl * 7) * p.power };
      projectiles.push(pr);
    },
  },
  frost: {
    icon: "❄️",
    nameKey: "w_frost",
    descKey: "w_frost_d",
    max: 6,
    cooldown: (lv) => {
      return Math.max(0.5, 1.2 - lv * 0.1);
    },
    fire: (p) => {
      const lvl = l(p, "frost");
      const n = 1 + Math.floor(lvl / 3);
      const targets = nearestEnemies(p.x, p.y, n);
      const dmg = (9 + lvl * 3) * p.power;
      for (let i = 0; i < n; i++) {
        const t = targets[i];
        const ang = t
          ? Math.atan2(t.y - p.y, t.x - p.x)
          : Math.atan2(p.dir.y, p.dir.x) + (i - n / 2) * 0.3;
        const pr = mkProj(p.x, p.y, ang, 300, dmg, 6, "#9be9ff", 1.3, false);
        pr.pierce = 2 + lvl;
        pr.slow = { dur: 1.6 + lvl * 0.2, factor: 0.5 };
        projectiles.push(pr);
      }
    },
  },
  orb: {
    icon: "🔮",
    nameKey: "w_orb",
    descKey: "w_orb_d",
    max: 6,
    cooldown: () => {
      return 2.0;
    }, // orbs persist between casts
    fire: (p) => {
      const lvl = l(p, "orb");
      const n = 2 + lvl;
      const radius = 70 + lvl * 6;
      const dmg = (8 + lvl * 3) * p.power;
      for (let i = 0; i < n; i++) {
        const pr = mkProj(p.x, p.y, 0, 0, dmg, 9, "#c79bff", 2.0, true);
        pr.orbit = { angle: (i / n) * 6.2832, radius: radius, speed: 3.2 };
        pr.rehit = 0.45;
        pr.rehitTimer = 0;
        projectiles.push(pr);
      }
    },
  },
  axe: {
    icon: "🪓",
    nameKey: "w_axe",
    descKey: "w_axe_d",
    max: 6,
    cooldown: (lv) => {
      return Math.max(0.55, 1.4 - lv * 0.12);
    },
    fire: (p) => {
      const lvl = l(p, "axe");
      const n = 1 + Math.floor((lvl + 1) / 2);
      const dmg = (18 + lvl * 6) * p.power;
      const face = p.dir.x >= 0 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const pr = mkProj(p.x, p.y, 0, 0, dmg, 10, "#dfe6ef", 1.4, false);
        pr.vx = face * (90 + Math.random() * 90);
        pr.vy = -(360 + Math.random() * 120);
        pr.gravity = 620;
        pr.pierce = 2 + lvl;
        pr.emoji = "🪓";
        pr.spin = 16;
        projectiles.push(pr);
      }
    },
  },
};

// ------------- Passive upgrade definitions -------------
const PASSIVES: Record<string, PassiveDef> = {
  speed: {
    icon: "👢",
    nameKey: "u_speed",
    descKey: "u_speed_d",
    max: 5,
    apply: (p) => {
      p.speed *= 1.12;
    },
  },
  health: {
    icon: "❤️",
    nameKey: "u_health",
    descKey: "u_health_d",
    max: 5,
    apply: (p) => {
      p.maxHp += 20;
      p.hp = Math.min(p.maxHp, p.hp + 20);
    },
  },
  magnet: {
    icon: "🧲",
    nameKey: "u_magnet",
    descKey: "u_magnet_d",
    max: 4,
    apply: (p) => {
      p.pickup *= 1.4;
    },
  },
  regen: {
    icon: "💚",
    nameKey: "u_regen",
    descKey: "u_regen_d",
    max: 4,
    apply: (p) => {
      p.regen += 1.2;
    },
  },
  power: {
    icon: "💪",
    nameKey: "u_power",
    descKey: "u_power_d",
    max: 5,
    apply: (p) => {
      p.power *= 1.15;
    },
  },
};

function l(p: Player, id: string): number {
  return p.weapons[id] || 0;
}

/* ====================== helpers / factories ==================== */
function mkProj(
  x: number,
  y: number,
  ang: number,
  spd: number,
  dmg: number,
  r: number,
  color: string,
  life: number,
  pierceAll: boolean,
): Projectile {
  return {
    x: x,
    y: y,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    dmg: dmg,
    r: r,
    color: color,
    life: life,
    pierce: pierceAll ? 999 : 1,
    homing: false,
    hitSet: null,
  };
}

function spawnSlash(p: Player, base: number, reach: number, dmg: number): void {
  // A short-lived arc hitbox represented as a fading particle + damage now.
  const arc = 1.1;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach * reach) continue;
    const a = Math.atan2(dy, dx);
    const da = Math.atan2(Math.sin(a - base), Math.cos(a - base));
    if (Math.abs(da) < arc) hitEnemy(e, dmg, dx, dy, 80);
  }
  particles.push({
    kind: "slash",
    x: p.x,
    y: p.y,
    base: base,
    reach: reach,
    arc: arc,
    life: 0.22,
    max: 0.22,
  });
}

function spawnRing(x: number, y: number, radius: number, color: string): void {
  particles.push({
    kind: "ring",
    x: x,
    y: y,
    radius: radius,
    color: color,
    life: 0.4,
    max: 0.4,
  });
}

function spawnZap(x: number, y: number): void {
  // A quick lightning flash: a jagged bolt dropping onto the target.
  const segs: ZapSeg[] = [];
  const sx = x + (Math.random() - 0.5) * 30;
  for (let i = 0; i <= 6; i++) {
    segs.push({
      x: x + (sx - x) * (1 - i / 6) + (Math.random() - 0.5) * 18,
      y: y - i * 42,
    });
  }
  particles.push({ kind: "zap", x: x, y: y, segs: segs, life: 0.22, max: 0.22 });
  spawnHit(x, y, "#bfe3ff");
}

function explodeProj(pr: Projectile): void {
  // Fiery AoE when an explosive projectile dies (timeout or impact).
  if (!pr.explode) return;
  const ex = pr.explode;
  const r2 = ex.radius * ex.radius;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const dx = e.x - pr.x;
    const dy = e.y - pr.y;
    if (dx * dx + dy * dy < r2) hitEnemy(e, ex.dmg, dx, dy, 120);
  }
  spawnRing(pr.x, pr.y, ex.radius, "#ff8a3c");
  for (let s = 0; s < 10; s++) {
    const a = Math.random() * 6.28;
    const sp = 60 + Math.random() * 130;
    particles.push({
      kind: "spark",
      x: pr.x,
      y: pr.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      color: "#ffb35c",
      life: 0.4,
      max: 0.4,
    });
  }
}

function spawnGem(x: number, y: number, value: number): void {
  gems.push({ x: x, y: y, value: value, r: 5, vx: 0, vy: 0, born: elapsed });
}

function spawnHit(x: number, y: number, color?: string): void {
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * 6.28;
    const s = 40 + Math.random() * 90;
    particles.push({
      kind: "spark",
      x: x,
      y: y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      color: color || "#ffd27a",
      life: 0.3,
      max: 0.3,
    });
  }
}

function nearestEnemies(x: number, y: number, n: number): Enemy[] {
  // Cheap partial selection — fine for the enemy counts we hit.
  const arr = enemies.slice();
  arr.sort((a, b) => {
    return (
      (a.x - x) * (a.x - x) +
      (a.y - y) * (a.y - y) -
      ((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y))
    );
  });
  return arr.slice(0, n);
}

/* ============================ enemies ========================== */
// Enemy archetypes unlock as the run progresses (difficulty curve).
const ENEMY_TYPES: EnemyType[] = [
  { id: "bat", emoji: "🦇", r: 11, hp: 10, speed: 56, dmg: 6, xp: 1, color: "#7b6cff", from: 0 },
  {
    id: "spider",
    emoji: "🕷️",
    r: 9,
    hp: 7,
    speed: 78,
    dmg: 5,
    xp: 1,
    color: "#a890ff",
    from: 25,
    escale: 1.2,
  },
  {
    id: "zombie",
    emoji: "🧟",
    r: 14,
    hp: 26,
    speed: 42,
    dmg: 10,
    xp: 2,
    color: "#6fae5f",
    from: 45,
  },
  { id: "imp", emoji: "👾", r: 11, hp: 22, speed: 92, dmg: 9, xp: 3, color: "#ff7bd0", from: 75 },
  { id: "ghost", emoji: "👻", r: 12, hp: 18, speed: 74, dmg: 8, xp: 2, color: "#cfe6ff", from: 90 },
  {
    id: "skull",
    emoji: "💀",
    r: 13,
    hp: 44,
    speed: 50,
    dmg: 14,
    xp: 4,
    color: "#e8e2c8",
    from: 150,
  },
  {
    id: "werewolf",
    emoji: "🐺",
    r: 16,
    hp: 70,
    speed: 66,
    dmg: 18,
    xp: 5,
    color: "#9aa0b5",
    from: 130,
  },
  {
    id: "troll",
    emoji: "🧌",
    r: 20,
    hp: 170,
    speed: 34,
    dmg: 26,
    xp: 9,
    color: "#7fae8c",
    from: 210,
  },
  {
    id: "demon",
    emoji: "👹",
    r: 17,
    hp: 90,
    speed: 46,
    dmg: 20,
    xp: 7,
    color: "#ff6b6b",
    from: 240,
  },
  {
    id: "dragon",
    emoji: "🐲",
    r: 26,
    hp: 360,
    speed: 40,
    dmg: 34,
    xp: 20,
    color: "#62d08a",
    from: 320,
  },
];

function spawnEnemy(): void {
  // Pick an available type, weighted toward newer (tougher) ones a bit.
  const avail: EnemyType[] = [];
  for (let i = 0; i < ENEMY_TYPES.length; i++) {
    if (elapsed >= ENEMY_TYPES[i].from) avail.push(ENEMY_TYPES[i]);
  }
  const type = avail[Math.floor(Math.random() * avail.length)];
  // Spawn just off the visible edge around the player.
  const ang = Math.random() * 6.28;
  const dist = Math.max(W, H) * 0.62 + 40;
  const hpScale = 1 + elapsed / 110; // enemies toughen over time
  const e: Enemy = {
    type: type,
    x: player.x + Math.cos(ang) * dist,
    y: player.y + Math.sin(ang) * dist,
    r: type.r,
    hp: type.hp * hpScale,
    maxHp: type.hp * hpScale,
    speed: type.speed * (0.85 + Math.random() * 0.3),
    dmg: type.dmg,
    xp: type.xp,
    color: type.color,
    emoji: type.emoji,
    escale: type.escale || 1.7, // emoji font size relative to radius
    flash: 0,
    slow: 0, // seconds of remaining chill (frost)
    knock: { x: 0, y: 0 },
  };
  enemies.push(e);
}

function hitEnemy(e: Enemy, dmg: number, dx: number, dy: number, knock: number): void {
  e.hp -= dmg;
  e.flash = 0.12;
  if (knock) {
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    e.knock.x += (dx / d) * knock;
    e.knock.y += (dy / d) * knock;
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e: Enemy): void {
  const i = enemies.indexOf(e);
  if (i !== -1) enemies.splice(i, 1);
  kills++;
  spawnGem(e.x, e.y, e.xp);
  spawnHit(e.x, e.y, e.color);
  ui.setStat("hp", kills);
}

/* ======================= run lifecycle ========================= */
function reset(): void {
  player = defaultPlayer();
  player.x = 0;
  player.y = 0;
  enemies = [];
  projectiles = [];
  gems = [];
  particles = [];
  _hazards = [];
  elapsed = 0;
  kills = 0;
  spawnTimer = 0;
  _slowMo = 0;
  camX = 0;
  camY = 0;
  // Start with one weapon.
  addWeapon("knife");
  ui.setStat("lvl", 1);
  ui.setStat("hp", 0);
  ui.setStat("time", "0:00");
}

function addWeapon(id: string): void {
  player.weapons[id] = (player.weapons[id] || 0) + 1;
  if (player.fireTimers[id] == null) player.fireTimers[id] = 0;
}
function addPassive(id: string): void {
  player.passives[id] = (player.passives[id] || 0) + 1;
  PASSIVES[id].apply(player);
}

function startGame(): void {
  reset();
  state = STATE_PLAY;
  overlay.classList.add("hidden");
  lastTime = performance.now();
}

function die(): void {
  state = STATE_DEAD;
  if (elapsed > best) {
    best = Math.floor(elapsed);
    store.save({ best: best });
  }
  showOverlay();
}

/* ========================= level-up =========================== */
function gainXp(v: number): void {
  player.xp += v;
  while (player.xp >= player.xpNeed) {
    player.xp -= player.xpNeed;
    player.level++;
    player.xpNeed = Math.round(5 + player.level * player.level * 0.9 + player.level * 2);
    ui.setStat("lvl", player.level);
    pendingLevelUps++;
  }
}
let pendingLevelUps = 0;

function maybeOpenLevelUp(): void {
  if (pendingLevelUps > 0 && state === STATE_PLAY) {
    pendingLevelUps--;
    openLevelUp();
  }
}

// Build the pool of offerable choices given current ownership.
function buildChoices(): Choice[] {
  const pool: Choice[] = [];
  let id: string;
  for (id in WEAPONS) {
    const wl = player.weapons[id] || 0;
    if (wl < WEAPONS[id].max) {
      pool.push({ kind: "weapon", id: id, lvl: wl, def: WEAPONS[id], isNew: wl === 0 });
    }
  }
  for (id in PASSIVES) {
    const pl = player.passives[id] || 0;
    if (pl < PASSIVES[id].max) {
      pool.push({ kind: "passive", id: id, lvl: pl, def: PASSIVES[id], isNew: pl === 0 });
    }
  }
  // Shuffle and take up to 3.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, 3);
}

function openLevelUp(): void {
  state = STATE_LEVELUP;
  const choices = buildChoices();
  if (!choices.length) {
    state = STATE_PLAY;
    return;
  }
  let html =
    `<div class="levelup-title">⬆️ ${T("levelup")}</div>` +
    `<div class="levelup-sub">${T("choose")}</div>` +
    '<div class="cards">';
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    const badge = c.isNew
      ? `<span class="card-lvl is-new">${T("newBadge")}</span>`
      : `<span class="card-lvl">${T("lvlBadge").replace("{n}", String(c.lvl + 1))}</span>`;
    html +=
      `<div class="card" data-i="${i}">` +
      `<div class="card-icon">${c.def.icon}</div>` +
      '<div class="card-body">' +
      `<div class="card-name">${T(c.def.nameKey)}${badge}</div>` +
      `<div class="card-desc">${T(c.def.descKey)}</div>` +
      "</div>" +
      "</div>";
  }
  html += "</div>";
  panel.innerHTML = html;
  panel.classList.remove("panel-wiki");
  overlay.classList.remove("hidden");

  const cards = panel.querySelectorAll<HTMLElement>(".card");
  for (let k = 0; k < cards.length; k++) {
    ((choice: Choice) => {
      cards[k].addEventListener("click", () => {
        pickChoice(choice);
      });
    })(choices[k]);
  }
}

function pickChoice(c: Choice): void {
  if (c.kind === "weapon") addWeapon(c.id);
  else addPassive(c.id);
  overlay.classList.add("hidden");
  state = STATE_PLAY;
  lastTime = performance.now();
  // Another level may be queued (multi-level on a big gem).
  maybeOpenLevelUp();
}

/* ===================== overlays (text screens) ================= */
function fmtTime(s: number): string {
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss < 10 ? "0" : ""}${ss}`;
}

function showOverlay(): void {
  let html = "";
  if (state === STATE_READY) {
    html =
      `<div class="title">🧛 ${T("title")}</div>` +
      `<div class="hint">${T("hint")}</div>` +
      (best > 0
        ? `<div class="score-line">${T("survivedLabel")} <b>${fmtTime(best)}</b></div>`
        : "") +
      `<button class="play-pill" id="ov-act">${T("start")}</button>`;
  } else if (state === STATE_DEAD) {
    html =
      `<div class="title">☠️ ${T("gameover")}</div>` +
      `<div class="score-line">${T("survivedLabel")} <b>${fmtTime(elapsed)}</b></div>` +
      `<div class="score-line">${T("levelLabel")} <b>${player.level}</b> · ${T("killsLabel")} <b>${kills}</b></div>` +
      (best > 0
        ? `<div class="hint" style="margin-top:10px;opacity:.7">★ ${T("survivedLabel")}: ${fmtTime(best)}</div>`
        : "") +
      `<button class="play-pill" id="ov-act">${T("playAgain")}</button>`;
  } else if (state === STATE_PAUSE) {
    html =
      `<div class="title">⏸ ${T("paused")}</div>` +
      `<button class="play-pill" id="ov-act">${T("resume")}</button>`;
  }
  panel.innerHTML = html;
  panel.classList.remove("panel-wiki");
  overlay.classList.remove("hidden");
  const btn = $("ov-act");
  if (btn) btn.addEventListener("click", onAction);
}

function onAction(): void {
  if (state === STATE_READY || state === STATE_DEAD) startGame();
  else if (state === STATE_PAUSE) {
    state = STATE_PLAY;
    overlay.classList.add("hidden");
    lastTime = performance.now();
  }
}

/* ============================ wiki ============================ */
function wikiCard(icon: string, name: string, desc: string, meta: string | null): string {
  return (
    '<div class="card wiki-card">' +
    `<div class="card-icon">${icon}</div>` +
    '<div class="card-body">' +
    `<div class="card-name">${name}${meta ? `<span class="card-lvl">${meta}</span>` : ""}</div>` +
    `<div class="card-desc">${desc}</div>` +
    "</div></div>"
  );
}

function showWiki(): void {
  let html = `<div class="levelup-title">📖 ${T("wikiTitle")}</div><div class="wiki-scroll">`;
  let id: string;
  let i: number;
  // Weapons
  html += `<div class="wiki-sec">${T("secWeapons")}</div><div class="cards">`;
  for (id in WEAPONS) {
    html += wikiCard(WEAPONS[id].icon, T(WEAPONS[id].nameKey), T(WEAPONS[id].descKey), null);
  }
  html += "</div>";
  // Power-ups (passives)
  html += `<div class="wiki-sec">${T("secPassives")}</div><div class="cards">`;
  for (id in PASSIVES) {
    html += wikiCard(PASSIVES[id].icon, T(PASSIVES[id].nameKey), T(PASSIVES[id].descKey), null);
  }
  html += "</div>";
  // Bestiary
  html += `<div class="wiki-sec">${T("secEnemies")}</div><div class="cards">`;
  for (i = 0; i < ENEMY_TYPES.length; i++) {
    const en = ENEMY_TYPES[i];
    const meta = en.from > 0 ? T("unlockAt").replace("{t}", fmtTime(en.from)) : null;
    html += wikiCard(en.emoji, T(`e_${en.id}`), T(`e_${en.id}_d`), meta);
  }
  html += "</div>";
  html += "</div>"; // .wiki-scroll
  html += `<button class="play-pill" id="wiki-close">${T("close")}</button>`;
  panel.innerHTML = html;
  panel.classList.add("panel-wiki");
  overlay.classList.remove("hidden");
  const btn = $("wiki-close");
  if (btn) btn.addEventListener("click", toggleWiki);
}

function toggleWiki(): void {
  if (state === STATE_WIKI) {
    // Restore whatever we interrupted.
    state = wikiReturn;
    panel.classList.remove("panel-wiki");
    if (state === STATE_PLAY) {
      overlay.classList.add("hidden");
      lastTime = performance.now();
    } else {
      showOverlay();
    }
    return;
  }
  if (state === STATE_LEVELUP || state === STATE_LOADOUT) return; // don't interrupt
  wikiReturn = state;
  state = STATE_WIKI;
  showWiki();
}

/* ========================== loadout =========================== */
// A small stat tile (icon + label + value) for the stats grid.
function statTile(icon: string, label: string, value: string | number): string {
  return (
    '<div class="stat-item">' +
    `<div class="si-icon">${icon}</div>` +
    '<div class="si-body">' +
    `<div class="si-label">${label}</div>` +
    `<div class="si-value">${value}</div>` +
    "</div></div>"
  );
}

// The level badge shown next to an owned weapon / power-up.
function levelBadge(lvl: number, max: number): string {
  return lvl >= max ? T("maxBadge") : T("lvlBadge").replace("{n}", String(lvl));
}

function showLoadout(): void {
  const p = player;
  let html = `<div class="levelup-title">🎒 ${T("loadoutTitle")}</div><div class="wiki-scroll">`;

  // --- Stats ---
  html += `<div class="wiki-sec">${T("secStats")}</div>`;
  html +=
    '<div class="stat-grid">' +
    statTile("❤️", T("st_hp"), `${Math.ceil(p.hp)} / ${p.maxHp}`) +
    statTile("⬆️", T("levelLabel"), p.level) +
    statTile("👢", T("st_speed"), Math.round(p.speed)) +
    statTile("💪", T("st_power"), `${Math.round(p.power * 100)}%`) +
    statTile("🧲", T("st_pickup"), Math.round(p.pickup)) +
    statTile("💚", T("st_regen"), `${p.regen.toFixed(1)}/s`) +
    statTile("💀", T("killsLabel"), kills) +
    statTile("⏱️", T("st_time"), fmtTime(elapsed)) +
    "</div>";

  // --- Owned weapons ---
  let id: string;
  let has: boolean;
  html += `<div class="wiki-sec">${T("secOwnedWeapons")}</div><div class="cards">`;
  has = false;
  for (id in WEAPONS) {
    const wl = p.weapons[id] || 0;
    if (wl <= 0) continue;
    has = true;
    html += wikiCard(
      WEAPONS[id].icon,
      T(WEAPONS[id].nameKey),
      T(WEAPONS[id].descKey),
      levelBadge(wl, WEAPONS[id].max),
    );
  }
  html += "</div>";

  // --- Owned power-ups ---
  html += `<div class="wiki-sec">${T("secOwnedPassives")}</div><div class="cards">`;
  for (id in PASSIVES) {
    const pl = p.passives[id] || 0;
    if (pl <= 0) continue;
    has = true;
    html += wikiCard(
      PASSIVES[id].icon,
      T(PASSIVES[id].nameKey),
      T(PASSIVES[id].descKey),
      levelBadge(pl, PASSIVES[id].max),
    );
  }
  html += "</div>";

  if (!has) {
    html += `<div class="loadout-empty">${T("loadoutEmpty")}</div>`;
  }

  html += "</div>"; // .wiki-scroll
  html += `<button class="play-pill" id="loadout-close">${T("close")}</button>`;
  panel.innerHTML = html;
  panel.classList.add("panel-wiki");
  overlay.classList.remove("hidden");
  const btn = $("loadout-close");
  if (btn) btn.addEventListener("click", toggleLoadout);
}

function toggleLoadout(): void {
  if (state === STATE_LOADOUT) {
    // Restore whatever we interrupted.
    state = loadoutReturn;
    panel.classList.remove("panel-wiki");
    if (state === STATE_PLAY) {
      overlay.classList.add("hidden");
      lastTime = performance.now();
    } else {
      showOverlay();
    }
    return;
  }
  if (state === STATE_LEVELUP || state === STATE_WIKI) return; // don't interrupt
  loadoutReturn = state;
  state = STATE_LOADOUT;
  showLoadout();
}

// Re-render any open text overlay live on language change.
MG.i18n.onChange(() => {
  if (state === STATE_READY || state === STATE_DEAD || state === STATE_PAUSE) showOverlay();
  else if (state === STATE_LEVELUP) openLevelUp();
  else if (state === STATE_WIKI) showWiki();
  else if (state === STATE_LOADOUT) showLoadout();
});

/* ============================ input ============================ */
const keys: Record<string, boolean> = {};
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) !== -1)
    e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.key === "Escape" || e.key === "p") togglePause();
  if (e.key === "i") toggleLoadout();
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

function togglePause(): void {
  if (state === STATE_PLAY) {
    state = STATE_PAUSE;
    showOverlay();
  } else if (state === STATE_PAUSE) {
    state = STATE_PLAY;
    overlay.classList.add("hidden");
    lastTime = performance.now();
  }
}

// Touch joystick: first touch anchors the stick, drag sets direction.
const stick = $("stick");
const stickNub = $("stick-nub");
let touchId: number | null = null;
let touchOrigin: Vec | null = null;
const touchVec: Vec = { x: 0, y: 0 };

function stagePoint(t: Touch): Vec {
  const rect = canvas.getBoundingClientRect();
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

canvas.addEventListener(
  "touchstart",
  (e) => {
    if (state !== STATE_PLAY) return;
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    touchOrigin = stagePoint(t);
    stick.style.left = `${touchOrigin.x - 60}px`;
    stick.style.top = `${touchOrigin.y - 60}px`;
    stick.classList.add("active");
    setNub(0, 0);
    e.preventDefault();
  },
  { passive: false },
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    if (touchId === null || touchOrigin === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== touchId) continue;
      const p = stagePoint(t);
      const dx = p.x - touchOrigin.x;
      const dy = p.y - touchOrigin.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const max = 48;
      const cl = Math.min(d, max);
      touchVec.x = dx / d;
      touchVec.y = dy / d;
      setNub(touchVec.x * cl, touchVec.y * cl);
      if (d < 8) {
        touchVec.x = 0;
        touchVec.y = 0;
      }
      e.preventDefault();
    }
  },
  { passive: false },
);

function endTouch(e: TouchEvent): void {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === touchId) {
      touchId = null;
      touchVec.x = 0;
      touchVec.y = 0;
      stick.classList.remove("active");
    }
  }
}
canvas.addEventListener("touchend", endTouch);
canvas.addEventListener("touchcancel", endTouch);

function setNub(x: number, y: number): void {
  stickNub.style.transform = `translate(${x}px,${y}px)`;
}

/* ============================ update ========================== */
function moveInput(): Vec {
  let ix = 0;
  let iy = 0;
  if (keys.a || keys.arrowleft) ix -= 1;
  if (keys.d || keys.arrowright) ix += 1;
  if (keys.w || keys.arrowup) iy -= 1;
  if (keys.s || keys.arrowdown) iy += 1;
  if (touchId !== null) {
    ix = touchVec.x;
    iy = touchVec.y;
  }
  const d = Math.sqrt(ix * ix + iy * iy);
  if (d > 1) {
    ix /= d;
    iy /= d;
  }
  return { x: ix, y: iy };
}

function update(dt: number): void {
  elapsed += dt;
  const p = player;

  // --- player movement ---
  const mv = moveInput();
  p.x += mv.x * p.speed * dt;
  p.y += mv.y * p.speed * dt;
  if (mv.x || mv.y) {
    p.dir.x = mv.x;
    p.dir.y = mv.y;
  }
  if (p.regen) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  if (p.hurtFlash > 0) p.hurtFlash -= dt;

  // Smooth camera follow.
  camX += (p.x - camX) * Math.min(1, dt * 8);
  camY += (p.y - camY) * Math.min(1, dt * 8);

  // --- spawning (ramps up over time) ---
  spawnTimer -= dt;
  const rate = Math.max(0.16, 0.95 - elapsed / 240); // seconds between spawns
  const batch = 1 + Math.floor(elapsed / 75);
  if (spawnTimer <= 0) {
    for (let s = 0; s < batch; s++) spawnEnemy();
    spawnTimer = rate;
  }
  if (enemies.length > 320) enemies.length = 320; // safety cap

  // --- weapons fire on their own timers ---
  for (const wid in p.weapons) {
    p.fireTimers[wid] -= dt;
    if (p.fireTimers[wid] <= 0) {
      WEAPONS[wid].fire(p);
      p.fireTimers[wid] = WEAPONS[wid].cooldown(p.weapons[wid]);
    }
  }

  // --- enemies ---
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.flash > 0) e.flash -= dt;
    if (e.slow > 0) e.slow -= dt;
    // knockback decays
    e.x += e.knock.x * dt;
    e.y += e.knock.y * dt;
    e.knock.x *= 0.001 ** dt;
    e.knock.y *= 0.001 ** dt;
    // chase player (chilled enemies crawl at half pace)
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const spd = e.slow > 0 ? e.speed * 0.5 : e.speed;
    e.x += (dx / d) * spd * dt;
    e.y += (dy / d) * spd * dt;
    // separation so they don't perfectly stack (cheap, neighbor sample)
    // touch player?
    if (d < e.r + p.r) {
      if (p.hurtFlash <= 0) {
        p.hp -= e.dmg;
        p.hurtFlash = 0.5;
        // small knock to enemy on contact
        e.knock.x -= (dx / d) * 120;
        e.knock.y -= (dy / d) * 120;
        if (p.hp <= 0) {
          p.hp = 0;
          die();
          return;
        }
      }
    }
  }
  // Light mutual separation pass (sampled to stay cheap).
  for (let a = 0; a < enemies.length; a++) {
    const ea = enemies[a];
    const eb = enemies[(a + 1) % enemies.length];
    if (ea === eb) continue;
    const sx = ea.x - eb.x;
    const sy = ea.y - eb.y;
    const sd = sx * sx + sy * sy;
    const min = ea.r + eb.r;
    if (sd < min * min && sd > 0.01) {
      const sdist = Math.sqrt(sd);
      const push = (min - sdist) * 0.5;
      const ux = sx / sdist;
      const uy = sy / sdist;
      ea.x += ux * push;
      ea.y += uy * push;
      eb.x -= ux * push;
      eb.y -= uy * push;
    }
  }

  // --- projectiles ---
  for (let j = projectiles.length - 1; j >= 0; j--) {
    const pr = projectiles[j];
    pr.life -= dt;
    if (pr.life <= 0) {
      explodeProj(pr);
      projectiles.splice(j, 1);
      continue;
    }
    if (pr.spin) pr.angle = (pr.angle || 0) + pr.spin * dt;
    if (pr.orbit) {
      // Orbits the player rather than flying free.
      pr.orbit.angle += pr.orbit.speed * dt;
      pr.x = p.x + Math.cos(pr.orbit.angle) * pr.orbit.radius;
      pr.y = p.y + Math.sin(pr.orbit.angle) * pr.orbit.radius;
    } else {
      if (pr.homing) {
        const tgt = nearestEnemies(pr.x, pr.y, 1)[0];
        if (tgt) {
          const ta = Math.atan2(tgt.y - pr.y, tgt.x - pr.x);
          const spd = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
          const ca = Math.atan2(pr.vy, pr.vx);
          const na = ca + Math.atan2(Math.sin(ta - ca), Math.cos(ta - ca)) * Math.min(1, dt * 6);
          pr.vx = Math.cos(na) * spd;
          pr.vy = Math.sin(na) * spd;
        }
      }
      if (pr.gravity) pr.vy += pr.gravity * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
    }
    // Rehit projectiles (orbs) periodically forget who they've struck.
    if (pr.rehit != null) {
      pr.rehitTimer = (pr.rehitTimer ?? 0) - dt;
      if (pr.rehitTimer <= 0) {
        pr.hitSet = null;
        pr.rehitTimer = pr.rehit;
      }
    }
    // collide with enemies
    for (let k = enemies.length - 1; k >= 0; k--) {
      const en = enemies[k];
      const ddx = en.x - pr.x;
      const ddy = en.y - pr.y;
      const rr = en.r + pr.r;
      if (ddx * ddx + ddy * ddy < rr * rr) {
        if (!pr.hitSet) pr.hitSet = [];
        if (pr.hitSet.indexOf(en) !== -1) continue;
        pr.hitSet.push(en);
        hitEnemy(en, pr.dmg, en.x - pr.x, en.y - pr.y, 60);
        if (pr.slow) en.slow = Math.max(en.slow, pr.slow.dur);
        // Orbiting / rehit projectiles persist; only timed-life ends them.
        if (pr.rehit == null) {
          pr.pierce--;
          if (pr.pierce <= 0) {
            explodeProj(pr);
            projectiles.splice(j, 1);
            break;
          }
        }
      }
    }
  }

  // --- gems / pickups ---
  for (let g = gems.length - 1; g >= 0; g--) {
    const gm = gems[g];
    const gdx = p.x - gm.x;
    const gdy = p.y - gm.y;
    const gd = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
    if (gd < p.pickup) {
      // accelerate toward player
      const pull = 1 - gd / p.pickup;
      gm.x += (gdx / gd) * (140 + pull * 360) * dt;
      gm.y += (gdy / gd) * (140 + pull * 360) * dt;
    }
    if (gd < p.r + gm.r + 4) {
      gainXp(gm.value);
      gems.splice(g, 1);
    }
  }

  // --- particles ---
  for (let q = particles.length - 1; q >= 0; q--) {
    const pt = particles[q];
    pt.life -= dt;
    if (pt.life <= 0) {
      particles.splice(q, 1);
      continue;
    }
    if (pt.kind === "spark") {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.9;
      pt.vy *= 0.9;
    }
  }

  // Open a queued level-up screen (pauses the sim).
  maybeOpenLevelUp();

  // --- HUD ---
  ui.setStat("time", fmtTime(elapsed));
  hudTime.textContent = fmtTime(elapsed);
  hudSub.textContent = `${T("level")} ${player.level} · ${kills}`;
  xpfill.style.width = `${(100 * player.xp) / player.xpNeed}%`;
}

/* ============================ render ========================== */
function draw(): void {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const ox = W / 2 - camX;
  const oy = H / 2 - camY;

  drawGround(ox, oy);

  // gems
  for (let g = 0; g < gems.length; g++) {
    const gm = gems[g];
    const gx = gm.x + ox;
    const gy = gm.y + oy;
    const pulse = 1 + Math.sin((elapsed - gm.born) * 6) * 0.12;
    ctx.fillStyle = gm.value >= 4 ? "#ffd34c" : "#4cf0d8";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    const rr = gm.r * pulse;
    ctx.moveTo(gx, gy - rr);
    ctx.lineTo(gx + rr, gy);
    ctx.lineTo(gx, gy + rr);
    ctx.lineTo(gx - rr, gy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // particles (rings / slashes behind actors)
  for (let q = 0; q < particles.length; q++) {
    const pt = particles[q];
    const a = pt.life / pt.max;
    if (pt.kind === "ring") {
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pt.x + ox, pt.y + oy, pt.radius, 0, 6.2832);
      ctx.stroke();
    } else if (pt.kind === "slash") {
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(pt.x + ox, pt.y + oy, pt.reach * 0.7, pt.base - pt.arc, pt.base + pt.arc);
      ctx.stroke();
    } else if (pt.kind === "zap") {
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#dff0ff";
      ctx.shadowColor = "#9be7ff";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let zi = 0; zi < pt.segs.length; zi++) {
        const sg = pt.segs[zi];
        if (zi === 0) ctx.moveTo(sg.x + ox, sg.y + oy);
        else ctx.lineTo(sg.x + ox, sg.y + oy);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;

  // enemies
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const ex = e.x + ox;
    const ey = e.y + oy;
    if (ex < -30 || ex > W + 30 || ey < -30 || ey > H + 30) continue;
    // body
    ctx.beginPath();
    ctx.arc(ex, ey, e.r, 0, 6.2832);
    ctx.fillStyle = e.flash > 0 ? "#ffffff" : e.slow > 0 ? "#86c8e8" : e.color;
    ctx.fill();
    // emoji face
    ctx.font = `${e.r * e.escale}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(e.emoji, ex, ey + 1);
    // hp pip when hurt
    if (e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(ex - e.r, ey - e.r - 6, e.r * 2, 3);
      ctx.fillStyle = "#ff5b6e";
      ctx.fillRect(ex - e.r, ey - e.r - 6, e.r * 2 * (e.hp / e.maxHp), 3);
    }
  }

  // projectiles
  for (let j = 0; j < projectiles.length; j++) {
    const pr = projectiles[j];
    const px = pr.x + ox;
    const py = pr.y + oy;
    if (pr.emoji) {
      // Emoji projectiles (axe, firebomb) spin as they fly.
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(pr.angle || 0);
      ctx.font = `${pr.r * 2.4}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pr.emoji, 0, 0);
      ctx.restore();
      continue;
    }
    ctx.fillStyle = pr.color;
    ctx.shadowColor = pr.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, py, pr.r, 0, 6.2832);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // particles (sparks above)
  for (let s = 0; s < particles.length; s++) {
    const sp = particles[s];
    if (sp.kind !== "spark") continue;
    ctx.globalAlpha = sp.life / sp.max;
    ctx.fillStyle = sp.color;
    ctx.beginPath();
    ctx.arc(sp.x + ox, sp.y + oy, 2.5, 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // player
  drawPlayer(W / 2, H / 2);

  // hurt vignette
  if (player && player.hp > 0 && player.hurtFlash > 0.25) {
    ctx.fillStyle = `rgba(255,40,60,${(player.hurtFlash - 0.25) * 0.6})`;
    ctx.fillRect(0, 0, W, H);
  }
  // low-hp pulse
  if (player && player.hp / player.maxHp < 0.3) {
    const pv = (Math.sin(elapsed * 6) * 0.5 + 0.5) * 0.25;
    ctx.fillStyle = `rgba(255,0,0,${pv})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function drawGround(ox: number, oy: number): void {
  ctx.fillStyle = "#11121d";
  ctx.fillRect(0, 0, W, H);
  // grid that scrolls with the camera for a sense of motion
  const grid = 64;
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  const startX = ((ox % grid) + grid) % grid;
  const startY = ((oy % grid) + grid) % grid;
  ctx.beginPath();
  for (let x = startX; x < W; x += grid) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = startY; y < H; y += grid) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function drawPlayer(cx: number, cy: number): void {
  if (!player) return;
  // garlic aura visual if owned
  if (player.weapons.aura) {
    const radius = 60 + player.weapons.aura * 12;
    ctx.fillStyle = "rgba(200,255,155,0.06)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 6.2832);
    ctx.fill();
  }
  // pickup range hint (faint)
  ctx.strokeStyle = "rgba(76,240,216,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, player.pickup, 0, 6.2832);
  ctx.stroke();

  // body
  ctx.beginPath();
  ctx.arc(cx, cy, player.r, 0, 6.2832);
  ctx.fillStyle = player.hurtFlash > 0.25 ? "#fff" : "#1a1c2e";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#4cf0d8";
  ctx.stroke();
  // hero face
  ctx.font = `${player.r * 1.7}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🧛", cx, cy + 1);

  // HP ring
  const frac = player.hp / player.maxHp;
  ctx.strokeStyle = frac < 0.3 ? "#ff5b6e" : "#4cf0d8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, player.r + 6, -Math.PI / 2, -Math.PI / 2 + 6.2832 * frac);
  ctx.stroke();
}

/* ============================ loop ============================ */
function loop(now: number): void {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05; // clamp big frame gaps (tab switches)
  if (state === STATE_PLAY) update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ============================ boot ============================ */
window.addEventListener("resize", resize);
resize();
reset();
state = STATE_READY;
showOverlay();
lastTime = performance.now();
requestAnimationFrame(loop);

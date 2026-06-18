/* ==========================================================================
   Minigames — shared runtime (window.MG)
   --------------------------------------------------------------------------
   A tiny, dependency-free helper that every game loads. It provides the two
   things games kept re-implementing:

     • MG.i18n      — language detection, persistence and translation, shared
                      across every game and the home page (one localStorage
                      key, so the chosen language follows the player around).
     • MG.mountHeader — a consistent top header bar (brand link home, optional
                      stat chips, a language selector and action buttons).

   No build step, no framework: load shared/mg.css + shared/mg.js and call
   MG.i18n.register({...}) then MG.mountHeader({...}).
   ========================================================================== */

import type {
  ActionDef,
  HeaderUI,
  I18n,
  Lang,
  MGGlobal,
  Migration,
  MountHeaderOpts,
  SaveStore,
  SaveSummary,
  StatDef,
  StorageFactory,
  StorageOpts,
  StringTable,
  Translations,
} from "./types";

/* ----------------------------------------------------------------- i18n -- */
const STORAGE_KEY = "mg.lang";
const SUPPORTED: readonly Lang[] = ["en", "ru", "es"];
const LABELS: Record<Lang, string> = { en: "EN", ru: "RU", es: "ES" };

// Per-language string tables. Games merge their own strings via register().
const dict: Record<Lang, StringTable> = { en: {}, ru: {}, es: {} };
const listeners: Array<(lng: Lang) => void> = [];

// Own-property check (Object.hasOwn would need an ES2022 lib; we target ES2020).
const hasOwn = (obj: object, key: PropertyKey): boolean =>
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn needs ES2022; we target ES2020.
  Object.prototype.hasOwnProperty.call(obj, key);

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.indexOf(saved as Lang) !== -1) return saved as Lang;
  } catch {
    /* private mode — fall through to navigator */
  }
  const l = (navigator.language || "en").slice(0, 2).toLowerCase();
  return SUPPORTED.indexOf(l as Lang) !== -1 ? (l as Lang) : "en";
}

let current = detect();

// Merge a { en: {...}, ru: {...}, es: {...} } dictionary into the tables.
function register(translations: Translations | null | undefined): I18n {
  if (!translations) return i18n;
  for (const lng of SUPPORTED) {
    const src = translations[lng];
    if (!src) continue;
    for (const key in src) {
      if (hasOwn(src, key)) dict[lng][key] = src[key];
    }
  }
  return i18n;
}

// Look up a key in the current language, falling back to English, then the
// key itself. Values may be any type (strings, arrays, …).
function t<T = string>(key: string): T {
  const table = dict[current] || dict.en;
  if (hasOwn(table, key)) return table[key] as T;
  if (hasOwn(dict.en, key)) return dict.en[key] as T;
  return key as T;
}

function set(lng: string): void {
  if (SUPPORTED.indexOf(lng as Lang) === -1 || lng === current) return;
  current = lng as Lang;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lng;
  for (let i = 0; i < listeners.length; i++) {
    try {
      listeners[i](current);
    } catch {
      /* a bad listener shouldn't break the rest */
    }
  }
}

// Subscribe to language changes; returns an unsubscribe function.
function onChange(fn: (lng: Lang) => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i !== -1) listeners.splice(i, 1);
  };
}

const i18n: I18n = {
  SUPPORTED,
  LABELS,
  register,
  t,
  set,
  onChange,
  get lang() {
    return current;
  },
};

// Reflect the detected language on <html> as early as possible.
try {
  document.documentElement.lang = current;
} catch {
  /* ignore */
}

/* --------------------------------------------------------------- header -- */
function el(tag: string, cls?: string | null, text?: string | null): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Mount a shared header bar.
 *
 *   var ui = MG.mountHeader({
 *     icon: "💣",
 *     titleKey: "title",            // i18n key (or use `title` for a literal)
 *     home: "../../",               // brand link target (defaults to ../../)
 *     lang: true,                   // show the language selector (default)
 *     mount: document.body,         // container; header is prepended (default: body)
 *     stats: [
 *       { key: "err", labelKey: "errors", variant: "alert" },
 *       { key: "pos", labelKey: "position", variant: "sm", value: "0, 0" }
 *     ],
 *     actions: [
 *       { key: "new", labelKey: "new", onClick: fn }
 *     ]
 *   });
 *
 *   ui.setStat("err", 3);           // update a stat value
 *   ui.stat("err");                 // the value <span> (for animations)
 *   ui.action("new");               // the action <button>
 *
 * Stat / action labels and the document title re-localize automatically
 * whenever the language changes.
 */
function mountHeader(opts?: MountHeaderOpts): HeaderUI {
  opts = opts || {};
  const header = el("header", "mg-header");

  // Brand — links back to the games home.
  const brand = el("a", "mg-brand") as HTMLAnchorElement;
  brand.href = opts.home || "../../";
  brand.appendChild(el("span", "mg-brand-icon", opts.icon || "🎮"));
  const brandTitle = el("b", "mg-brand-title");
  brand.appendChild(brandTitle);
  header.appendChild(brand);

  // Stat chips.
  const statRefs: Record<string, { label: HTMLElement; value: HTMLSpanElement; def: StatDef }> = {};
  if (opts.stats?.length) {
    const slot = el("div", "mg-slot");
    opts.stats.forEach((s) => {
      const chip = el("div", `mg-stat${s.variant ? ` mg-stat--${s.variant}` : ""}`);
      const label = el("span", "mg-stat-k");
      const value = el(
        "span",
        "mg-stat-v",
        s.value != null ? String(s.value) : "0",
      ) as HTMLSpanElement;
      chip.appendChild(label);
      chip.appendChild(value);
      slot.appendChild(chip);
      statRefs[s.key] = { label, value, def: s };
    });
    header.appendChild(slot);
  }

  // Actions — language selector first, then game buttons.
  const actions = el("div", "mg-actions");
  let langSel: HTMLSelectElement | null = null;
  if (opts.lang !== false) {
    langSel = el("select", "mg-lang") as HTMLSelectElement;
    langSel.setAttribute("aria-label", "Language");
    for (const lng of SUPPORTED) {
      const o = el("option", null, LABELS[lng]) as HTMLOptionElement;
      o.value = lng;
      langSel.appendChild(o);
    }
    langSel.value = current;
    langSel.addEventListener("change", () => {
      if (langSel) set(langSel.value);
    });
    actions.appendChild(langSel);
  }

  const actionRefs: Record<string, { btn: HTMLButtonElement; def: ActionDef }> = {};
  (opts.actions || []).forEach((a) => {
    const btn = el("button", "mg-btn") as HTMLButtonElement;
    if (a.id) btn.id = a.id;
    if (a.onClick) btn.addEventListener("click", a.onClick);
    actionRefs[(a.key || a.id) as string] = { btn, def: a };
    actions.appendChild(btn);
  });
  header.appendChild(actions);

  const container = opts.mount || document.body;
  container.insertBefore(header, container.firstChild);

  function applyText() {
    const o = opts as MountHeaderOpts;
    const title = o.titleKey ? t<string>(o.titleKey) : o.title || "";
    brandTitle.textContent = title;
    if (o.documentTitle !== false) {
      document.title = `${o.icon ? `${o.icon} ` : ""}${title} — Minigames`;
    }
    for (const key in statRefs) {
      const sref = statRefs[key];
      if (sref.def.labelKey) sref.label.textContent = t<string>(sref.def.labelKey);
      else if (sref.def.label) sref.label.textContent = sref.def.label;
    }
    for (const key in actionRefs) {
      const aref = actionRefs[key];
      if (aref.def.labelKey) aref.btn.textContent = t<string>(aref.def.labelKey);
      else if (aref.def.label) aref.btn.textContent = aref.def.label;
      if (aref.def.titleKey) aref.btn.title = t<string>(aref.def.titleKey);
    }
    if (langSel) langSel.value = current;
  }

  applyText();
  onChange(applyText);

  return {
    el: header,
    setStat: (key: string, val: string | number) => {
      if (statRefs[key]) statRefs[key].value.textContent = String(val);
    },
    stat: (key: string) => (statRefs[key] ? statRefs[key].value : null),
    action: (key: string) => (actionRefs[key] ? actionRefs[key].btn : null),
    refresh: applyText,
  };
}

/* ---------------------------------------------------------------- save -- */
/*
 * MG.storage(name, opts) — a small, versioned save store shared by every
 * game. Each store owns one namespaced localStorage key and wraps the saved
 * payload in an envelope so the data can be migrated as a game evolves:
 *
 *     { "v": <version>, "t": <savedAt ms>, "data": <your data> }
 *
 * Usage:
 *
 *     var store = MG.storage("flappy-bird", {
 *       version: 2,
 *       migrations: {
 *         // Run when loading a save whose version is below the key.
 *         // Each step upgrades the previous version's data in place.
 *         1: function (data) { return { best: data.high || 0 }; },     // 0 → 1
 *         2: function (data) { data.runs = data.runs || 0; return data; } // 1 → 2
 *       }
 *     });
 *
 *     var data = store.load() || { best: 0 };   // null when nothing is saved
 *     store.save(data);                          // persist at the current version
 *     store.update(function (d) {                // load → mutate → save
 *       d = d || { best: 0 };
 *       if (score > d.best) d.best = score;
 *       return d;
 *     });
 *     store.clear();                             // wipe this game's save
 *
 * Migrations run stepwise from the stored version up to `version`, so a save
 * written long ago is brought current the next time it loads (and re-saved).
 * Everything degrades gracefully: in private mode / when localStorage throws,
 * the store keeps the value in memory so the game still works for the session.
 */
const SAVE_PREFIX = "mg.save.";

interface Envelope {
  v: number;
  t: number;
  data: any;
}

const storage = (<T = any>(name: string, opts?: StorageOpts): SaveStore<T> => {
  opts = opts || {};
  const version = opts.version || 1;
  const migrations: Record<number, Migration> = opts.migrations || {};
  const key = SAVE_PREFIX + name;
  let mem: any = null; // last value we wrote — the in-memory fallback
  let memOnly = false; // true once localStorage proves unavailable

  function read(): any {
    if (memOnly) return mem;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return mem; // corrupt JSON or no access — fall back to memory
    }
  }

  function write(env: Envelope): void {
    mem = env;
    if (memOnly) return;
    try {
      localStorage.setItem(key, JSON.stringify(env));
    } catch {
      memOnly = true; // private mode / quota — keep going in memory only
    }
  }

  // Upgrade `data` from `from` up to the current version, one step at a time.
  function migrate(data: any, from: number): any {
    for (let v = from + 1; v <= version; v++) {
      const step = migrations[v];
      if (typeof step === "function") {
        try {
          data = step(data, v);
        } catch {
          /* skip a broken step */
        }
      }
    }
    return data;
  }

  function save(data: T): T {
    write({ v: version, t: Date.now(), data });
    return data;
  }

  function load(): T | null {
    const env = read();
    if (!env || typeof env !== "object") return null;
    const from = typeof env.v === "number" ? env.v : 0;
    // Saved by a newer build, or already current — hand the data back as-is.
    if (from >= version) return env.data;
    // Older save — migrate and persist the upgraded copy.
    return save(migrate(env.data, from));
  }

  function update(fn: (current: T | null) => T): T {
    return save(fn(load()));
  }

  function clear(): void {
    mem = null;
    if (memOnly) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  return {
    key,
    version,
    load,
    save,
    update,
    clear,
  };
}) as StorageFactory;

/*
 * Static helpers for managing every game's save from one place (e.g. the home
 * page's save manager). These work directly on localStorage — the durable
 * store — so they can discover and wipe saves without instantiating a store
 * for each game. In private mode (no localStorage) there is nothing durable
 * to manage, so list() returns an empty array.
 */

// Enumerate all persisted saves. Returns an array of envelope summaries:
//   { name, key, version, savedAt }  (savedAt is a ms timestamp, or null)
// sorted most-recently-saved first.
storage.list = (): SaveSummary[] => {
  const out: SaveSummary[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.indexOf(SAVE_PREFIX) !== 0) continue;
      let env: any = null;
      try {
        env = JSON.parse(localStorage.getItem(k) as string);
      } catch {
        env = null;
      }
      if (!env || typeof env !== "object") continue;
      out.push({
        name: k.slice(SAVE_PREFIX.length),
        key: k,
        version: typeof env.v === "number" ? env.v : 0,
        savedAt: typeof env.t === "number" ? env.t : null,
      });
    }
  } catch {
    /* no localStorage — nothing to list */
  }
  out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return out;
};

// Remove a single save by its name (the same name passed to MG.storage(name)).
storage.remove = (name: string): void => {
  try {
    localStorage.removeItem(SAVE_PREFIX + name);
  } catch {
    /* ignore */
  }
};

// Wipe every game's save in one shot.
storage.clearAll = (): void => {
  storage.list().forEach((s) => {
    storage.remove(s.name);
  });
};

/* ----------------------------------------------------------------- pwa -- */
/*
 * Turn the site into an installable, offline-capable PWA. Because every page
 * and game loads this script, doing it here means each one gets the manifest,
 * the right install metadata and the registered service worker without having
 * to touch its HTML. Paths are resolved relative to this script's own URL, so
 * they stay correct whether the page lives at the root or under games/<name>/.
 */
function siteRoot(): string | null {
  try {
    let s = document.currentScript as HTMLScriptElement | null;
    if (!s || !/shared\/mg\.js/.test(s.src || "")) {
      const all = document.getElementsByTagName("script");
      for (let i = all.length - 1; i >= 0; i--) {
        if (/shared\/mg\.js(\?|$)/.test(all[i].src)) {
          s = all[i];
          break;
        }
      }
    }
    if (s?.src) return s.src.replace(/shared\/mg\.js.*$/, "");

    // Migrated pages bundle the runtime into a module script, so there's no
    // shared/mg.js tag to anchor on. Derive the site root from the page URL
    // instead: game pages live under games/<name>/, the home page sits at the
    // root. Keeps subdirectory deploys working (the root isn't assumed to be
    // the origin's "/").
    const path = location.pathname;
    const underGames = path.match(/^(.*\/)games\/[^/]+\//);
    if (underGames) return underGames[1];
    return path.replace(/[^/]*$/, "");
  } catch {
    /* ignore */
  }
  return null;
}

function setupPWA(): void {
  // Service workers (and most install machinery) only work over http(s);
  // opening a game from the filesystem (file://) is fine, just not offline.
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  const root = siteRoot();
  if (!root) return;
  const head = document.head || document.getElementsByTagName("head")[0];
  if (!head) return;

  function ensureLink(rel: string, href: string): void {
    if (document.querySelector(`link[rel="${rel}"]`)) return;
    const link = el("link") as HTMLLinkElement;
    link.rel = rel;
    link.href = href;
    head.appendChild(link);
  }

  function ensureMeta(name: string, content: string): void {
    if (document.querySelector(`meta[name="${name}"]`)) return;
    const meta = el("meta") as HTMLMetaElement;
    meta.name = name;
    meta.content = content;
    head.appendChild(meta);
  }

  ensureLink("manifest", `${root}manifest.webmanifest`);
  ensureLink("apple-touch-icon", `${root}icon.svg`);
  ensureMeta("theme-color", "#0f1020");
  ensureMeta("mobile-web-app-capable", "yes");
  ensureMeta("apple-mobile-web-app-capable", "yes");
  ensureMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
  ensureMeta("apple-mobile-web-app-title", "Minigames");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`${root}sw.js`, { scope: root }).catch(() => {
        /* offline support is best-effort */
      });
    });
  }
}

try {
  setupPWA();
} catch {
  /* never let PWA setup break a page */
}

/* --------------------------------------------------------------- expose -- */
export const MG: MGGlobal = {
  i18n,
  mountHeader,
  storage,
  el,
};

// Publish to the global for legacy <script> consumers; merge so cards.ts can
// attach `.cards` to the same object (mirrors the old `var MG = global.MG || {}`).
window.MG = Object.assign(window.MG || ({} as MGGlobal), MG);

export { el, i18n, mountHeader, storage };
export default MG;

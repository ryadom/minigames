# CLAUDE.md

Guidance for working in this repository.

## What this is

A collection of small, self-contained browser minigames, served as a **static
site** at https://minigames.ryadom.me. The home page lists the games; each game
is its own page under `games/<name>/`.

## Architecture (read this before changing structure)

This is a **zero-build static site**. There is intentionally **no bundler and no
framework** (no React/Vite/webpack). The repository root *is* the deployed site:
GitHub Pages uploads it as-is and serves the files directly. This keeps games
trivially portable (a game is one `index.html` you can open from disk) and the
deploy pipeline dependency-free.

Node is used **only for local tooling** (a dev server and a validation script).
It is never part of the deploy — do not introduce a build step that the site
depends on to run.

```
.
├── index.html              # Home page shell
├── styles.css              # Home page styles
├── games.js                # Registry: window.GAMES (title, icon, url, description)
├── app.js                  # Renders the game list + home language control
├── manifest.webmanifest    # PWA manifest (installable app metadata)
├── sw.js                   # Service worker (offline cache, scope "/")
├── icon.svg                # PWA / app icon (maskable)
├── shared/
│   ├── mg.js               # Shared runtime: window.MG (i18n + header + PWA)
│   └── mg.css              # Shared chrome styles (header bar, theme tokens)
├── games/
│   ├── minesweeper/index.html
│   └── flappy-bird/index.html
├── scripts/
│   ├── serve.mjs           # `npm run dev` — zero-dep static server
│   └── validate.mjs        # `npm run check` — structure validation
└── .github/workflows/deploy.yml
```

## The shared runtime (`shared/mg.js` → `window.MG`)

Every game and the home page load `shared/mg.css` + `shared/mg.js` and use the
common chrome instead of re-implementing it. Two pieces:

### `MG.i18n` — language control

- Supported languages: `en`, `ru`, `es` (`MG.i18n.SUPPORTED`).
- The chosen language is **shared site-wide** via one `localStorage` key
  (`mg.lang`), so it follows the player between the home page and every game.
  Falls back to the browser language, then English.
- API:
  - `MG.i18n.register({ en: {...}, ru: {...}, es: {...} })` — merge string tables.
  - `MG.i18n.t(key)` — translate (falls back to `en`, then the key itself).
    Values can be any type, including arrays.
  - `MG.i18n.set(lang)` / `MG.i18n.lang` — change / read the current language.
  - `MG.i18n.onChange(fn)` — subscribe to language changes; returns an
    unsubscribe function. Use it to re-render localized text live.

### `MG.mountHeader(opts)` — common header bar

Renders a consistent dark header bar (brand link back to the games home, optional
stat chips, a language selector and action buttons). Labels and the document
title re-localize automatically on language change.

```js
var ui = MG.mountHeader({
  icon: "💣",
  titleKey: "title",                 // i18n key (or `title:` for a literal)
  stats: [
    { key: "err", labelKey: "errors", variant: "alert" },
    { key: "pos", labelKey: "position", variant: "sm", value: "0, 0" },
  ],
  actions: [
    { key: "new", labelKey: "new", onClick: fn },
  ],
});
ui.setStat("err", 3);   // update a stat value
ui.stat("err");         // the value <span> (e.g. for flash animations)
ui.action("new");       // the action <button>
```

Stat variants: `alert` (red), `sm` (smaller value font for coords/seeds).

The page must use the shared layout classes: `<body class="mg-app">` plus a
`<div class="mg-game-area">…</div>` to host the canvas/stage. The header is
prepended above it.

### `MG.storage(name, opts)` — versioned save store

The one save mechanism every game shares. Each store owns a single namespaced
`localStorage` key (`mg.save.<name>`) and wraps the payload in an envelope —
`{ v, t, data }` — so saves can be **migrated** as a game evolves rather than
silently discarded. Pass `version` (a number) and an optional `migrations` map
keyed by target version; on load, steps run in order from the stored version up
to the current one, then the upgraded copy is re-saved. Everything degrades
gracefully: if `localStorage` is unavailable (private mode / quota), the value
is kept in memory so the game still works for the session.

```js
var store = MG.storage("flappy-bird", {
  version: 2,
  migrations: {
    1: function (d) { return { best: d.high || 0 }; },        // 0 → 1 (legacy)
    2: function (d) { d.runs = d.runs || 0; return d; },       // 1 → 2
  },
});

var data = store.load() || { best: 0 };   // null when nothing is saved yet
store.save(data);                          // persist at the current version
store.update(function (d) {                // load → mutate → save
  d = d || { best: 0 };
  if (score > d.best) d.best = score;
  return d;
});
store.clear();                             // wipe this game's save
```

Use a distinct `name` per game (the game's folder name is the convention).
A save written by a *newer* build than the current one is returned as-is rather
than downgraded.

## PWA / offline support

The site is an installable, offline-capable PWA, and it stays **zero-build**:

- `manifest.webmanifest` + `icon.svg` (root) describe the installable app.
- `sw.js` (root) is the service worker. Its scope is the whole site (`/`); it
  precaches the app shell and uses **stale-while-revalidate** for everything
  else, so each game is cached the first time it's visited and works offline
  after that. Bump `CACHE` in `sw.js` when the precached shell changes.
- `shared/mg.js` does the wiring for **every** page: since every game already
  loads it, it injects the `<link rel="manifest">` + install metadata and
  registers the service worker — no per-game HTML changes needed. Paths are
  resolved relative to `mg.js`'s own URL, so they work from any depth. Setup is
  a no-op on `file://` (service workers need http/https), so games still open
  directly from disk.

When adding a game you get PWA support for free (it loads `mg.js`). `npm run
check` validates the manifest and that its icons exist.

## Adding a game

1. Create `games/<name>/index.html`. In `<head>`, load the shared runtime:
   ```html
   <link rel="stylesheet" href="../../shared/mg.css" />
   <script src="../../shared/mg.js"></script>
   ```
2. Use `<body class="mg-app">` with a `<div class="mg-game-area">` host, register
   translations with `MG.i18n.register(...)`, and mount `MG.mountHeader(...)`.
3. Register the game in `games.js` (`title`, `icon`, `url`, and a `description`
   that is either a string or a `{ en, ru, es }` map).
4. Run `npm run check` and `npm run dev` to verify, then commit and push.

## Commands

- `npm run dev` — serve the site locally at http://localhost:8000 (no deps).
- `npm run check` — validate the registry + structure (CI-friendly, exits non-zero on failure).

No install step is required; both scripts use only Node's standard library
(Node >= 18).

## Conventions

- Vanilla ES5-friendly JS in IIFEs with `"use strict"` — match the existing
  style; no transpilation is assumed.
- Game-specific look stays inside the game; shared chrome stays in `shared/`.
- Keep games dependency-free and openable directly from the filesystem.
- **Games must work on mobile devices.** Phones are a first-class target, so:
  - Build for touch, not just mouse/keyboard — every control must be reachable
    by tap. Don't hide actions behind `:hover` (there is no hover on touch) and
    keep tap targets comfortably large (~44px).
  - Make the layout responsive: the playfield should fit small, portrait screens
    without horizontal scroll, and the shared header is kept slim on phones (see
    the mobile rules in `shared/mg.css`) so it doesn't crowd out the game.
  - Test at narrow widths (e.g. ~360px) before committing.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which uploads the repo
root to GitHub Pages. The custom domain is set via `CNAME`.

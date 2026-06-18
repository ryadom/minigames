# CLAUDE.md

Guidance for working in this repository.

## What this is

A collection of small, self-contained browser minigames, served as a **static
site** at https://minigames.ryadom.me. The home page lists the games; each game
is its own page under `games/<name>/`.

## Architecture (read this before changing structure)

This is a **static site** with a thin TypeScript build. There is intentionally
**no runtime framework** (no React/Vue/etc.). The sources are TypeScript;
[Bun](https://bun.sh) compiles and bundles them into `dist/`, and **`dist/` is
what GitHub Pages deploys**. There is no framework the *running* site depends on
— the output is plain static HTML/CSS/JS.

The whole codebase is **TypeScript ES modules** — the home page, every game,
the shared runtime and the service worker. (It was migrated from an original
zero-build, ES5, `window`-global style; that migration is now complete, so no
legacy `<script src=".../shared/mg.js">` global-loading game code remains.)
Each page bundles the runtime in via `import { MG } from ".../shared/mg"`.

`build.ts` (run by `bun run build`) does three things:

1. Copies every static asset (HTML, CSS, images, PWA files, `CNAME`, …) into
   `dist/`, skipping tooling and `.ts` sources.
2. Compiles the service worker (`sw.ts`) to a classic root `sw.js`.
3. Bundles the home page (`app.ts`) and each game (ES modules) into one
   self-contained module script (the shared runtime is inlined into each).

Bun is also the package manager / task runner; **Biome** does lint + format and
**`tsc --noEmit`** does type-checking. None of these run in the browser — they
produce/check the static `dist/` output.

```
.
├── index.html              # Home page shell (loads the app.ts module bundle)
├── styles.css              # Home page styles
├── games.ts                # Registry: exports GAMES (title, icon, url, description)
├── app.ts                  # Renders the game list + home language control
├── manifest.webmanifest    # PWA manifest (installable app metadata)
├── sw.ts                   # Service worker (offline cache, scope "/"); built to sw.js
├── icon.svg                # PWA / app icon (maskable)
├── build.ts                # Bun build → dist/ (copy static + compile shared + bundle pages)
├── tsconfig.json           # TypeScript config (strict, noEmit; Bun bundles)
├── biome.json              # Biome lint + format config
├── global.d.ts             # Ambient types (window.MG)
├── shared/
│   ├── mg.ts               # Shared runtime: window.MG (i18n + header + storage + PWA)
│   ├── cards.ts            # Shared playing-card runtime (window.MG.cards)
│   ├── types.ts            # Public types for the shared runtime
│   ├── mg.css              # Shared chrome styles (header bar, theme tokens)
│   └── cards.css           # Shared card styles
├── games/
│   └── <name>/             # Each game: TypeScript ES modules (js/*.ts, entry js/main.ts)
├── scripts/
│   ├── serve.mjs           # `bun run dev` — static server (serves dist/ via SERVE_ROOT)
│   └── validate.mjs        # `bun run check` — structure validation
└── .github/workflows/
    ├── ci.yml              # lint + typecheck + validate + build (push / PR)
    └── deploy.yml          # build with Bun, deploy dist/ to GitHub Pages
```

Every game's module entry point is listed in the `GAMES` array in `build.ts`,
and its `index.html` loads a single `<script type="module" src="js/main.js">`.

## The shared runtime (`shared/mg.ts` → `window.MG`)

Games `import { MG } from "../../../shared/mg"` and the bundler inlines the
runtime into each page's module — so there's no standalone runtime script to
load (the `window.MG` global still exists at runtime, set by the inlined
runtime, but nothing depends on a classic `<script>`). The public type surface
lives in
`shared/types.ts` (`MGGlobal`, `I18n`, `MountHeaderOpts`, `HeaderUI`,
`SaveStore`, …). Pieces:

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

The site is an installable, offline-capable PWA:

- `manifest.webmanifest` + `icon.svg` (root) describe the installable app.
- `sw.ts` (root, built to `dist/sw.js`) is the service worker. Its scope is the
  whole site (`/`); it precaches the app shell and uses
  **stale-while-revalidate** for everything else, so each game is cached the
  first time it's visited and works offline after that. Bump `CACHE` in `sw.ts`
  when the precached shell changes.
- The shared runtime does the wiring for **every** page: since every page
  bundles it in, it injects the `<link rel="manifest">` + install metadata and
  registers the service worker — no per-game HTML changes needed. It resolves
  the site root from the page URL, so it works at the root or under
  `games/<name>/`. Setup is a no-op on `file://` (service workers need
  http/https).

When adding a game you get PWA support for free (it loads the shared runtime).
`bun run check` validates the manifest and that its icons exist.

## Adding a game

New games should be written in **TypeScript ES modules** (the Farm game is the
reference). To add one:

1. Create `games/<name>/index.html`. Load the shared stylesheet and a single
   module entry point (the bundler emits the `.js`):
   ```html
   <link rel="stylesheet" href="../../shared/mg.css" />
   ...
   <script type="module" src="js/main.js"></script>
   ```
2. Write the game as TypeScript modules under `games/<name>/js/` (entry
   `main.ts`), importing the shared runtime directly:
   ```ts
   import { MG } from "../../../shared/mg";
   import type { HeaderUI } from "../../../shared/types";
   ```
   Use `<body class="mg-app">` with a `<div class="mg-game-area">` host, register
   translations with `MG.i18n.register(...)`, and mount `MG.mountHeader(...)`.
3. Add the game's entry point to the `GAMES` list in `build.ts`.
4. Register the game in `games.ts` (add an entry to the exported `GAMES`
   array — `title`, `icon`, `url`, and a `description` that is either a string
   or a `{ en, ru, es }` map).
5. Run `bun run lint && bun run typecheck && bun run check && bun run build` to
   verify, then commit and push.

(Every game in the repo is already a TypeScript ES module — use any of them, or
the 🚜 Farm game, as a reference.)

## Commands

- `bun install` — install dev tooling (TypeScript, Biome). One-time.
- `bun run build` — compile + bundle the site into `dist/`.
- `bun run dev` — build, then serve `dist/` at http://localhost:8000.
- `bun run lint` — Biome lint + format check. `bun run format` auto-fixes.
- `bun run typecheck` — `tsc --noEmit` (strict).
- `bun run check` — validate the registry + structure (exits non-zero on failure).

Requires [Bun](https://bun.sh) ≥ 1.3.

## Conventions

- **TypeScript ES modules** for new/migrated code (`import`/`export`, strict
  types). Match the Farm game's style. Legacy games stay ES5 IIFE until ported.
- Lint & format with **Biome** (`bun run lint` / `bun run format`): double
  quotes, semicolons, 2-space indent, 100-col width, trailing commas.
- Type definitions for the shared runtime live in `shared/types.ts`; keep the
  runtime and that contract in sync.
- Game-specific look stays inside the game; shared chrome stays in `shared/`.
- Keep games dependency-free (no npm runtime deps — only dev tooling).
- **Games must work on mobile devices.** Phones are a first-class target, so:
  - Build for touch, not just mouse/keyboard — every control must be reachable
    by tap. Don't hide actions behind `:hover` (there is no hover on touch) and
    keep tap targets comfortably large (~44px).
  - Make the layout responsive: the playfield should fit small, portrait screens
    without horizontal scroll, and the shared header is kept slim on phones (see
    the mobile rules in `shared/mg.css`) so it doesn't crowd out the game.
  - Test at narrow widths (e.g. ~360px) before committing.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which installs deps
with Bun, runs `bun run build`, and uploads the resulting `dist/` to GitHub
Pages. A separate `ci.yml` runs lint + typecheck + structure validation + build
on every push and pull request. The custom domain is set via `CNAME` (copied
into `dist/` by the build).

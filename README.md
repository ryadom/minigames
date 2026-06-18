# 🎮 Minigames

A collection of free browser minigames. No installs, no sign-ups — just play.

**Live site:** https://minigames.ryadom.me

> New games get added to the registry and show up on the home page
> automatically.
>
> **Games:** 💣 [Minesweeper](./games/minesweeper/) · 🐤 [Flappy
> Bird](./games/flappy-bird/) · 🚜 [Farm](./games/farm/) · 🐍
> [Snake](./games/snake/) · 🃏 [Solitaire](./games/solitaire/) … and more.

## How it works

The site is a **static site** served straight from GitHub Pages — there is no
runtime framework. The sources are **TypeScript**, compiled and bundled with
[Bun](https://bun.sh) into a `dist/` folder that *is* the deployed site.

The whole site is **TypeScript ES modules** — the home page, every game, the
shared runtime and the service worker. Each page imports the shared runtime
directly and the bundler inlines it into that page's module. (The shared
runtime is also emitted as a classic IIFE global script, `dist/shared/mg.js`,
for any classic-`<script>` consumer, but nothing in the site relies on it.)

A small shared runtime gives every page consistent chrome:

- **`shared/mg.ts`** (`window.MG`) — language control, a common game header, and
  a versioned save store.
- **`shared/mg.css`** — the header-bar styles and shared theme tokens.

| Path                            | Purpose                                              |
| ------------------------------- | ---------------------------------------------------- |
| `index.html`                    | Home page shell                                      |
| `games.ts`                      | Registry of games (exports `GAMES`)                  |
| `app.ts`                        | Renders the game list + home language switch         |
| `sw.ts`                         | Service worker (offline cache, scope `/`)            |
| `shared/mg.ts`                  | Shared runtime: i18n + header + save store (`MG`)    |
| `shared/cards.ts`               | Shared playing-card runtime (`MG.cards`)             |
| `shared/types.ts`               | Public TypeScript types for the shared runtime       |
| `shared/*.css`                  | Shared chrome / card styles                          |
| `games/*/`                      | The games (TS ES modules, entry `js/main.ts`)        |
| `build.ts`                      | Bun build → `dist/`                                  |
| `tsconfig.json` / `biome.json`  | TypeScript + Biome (lint/format) config              |
| `scripts/`                      | Dev server + structure validator                     |
| `CNAME`                         | Custom domain (`minigames.ryadom.me`)                |
| `.github/workflows/`            | `ci.yml` (checks) + `deploy.yml` (build & deploy)    |

## Language control

Languages (🇬🇧 EN / 🇷🇺 RU / 🇪🇸 ES) are handled in one place, `MG.i18n`. The
chosen language is stored once (`localStorage` key `mg.lang`) and **follows the
player across the home page and every game**. Each page registers its own
strings and the shared header + content re-render live when the language
changes.

```ts
MG.i18n.register({
  en: { title: "My Game", play: "Play" },
  ru: { title: "Моя игра", play: "Играть" },
  es: { title: "Mi juego", play: "Jugar" },
});
MG.i18n.t("play");          // -> current language, falls back to EN
MG.i18n.onChange(render);   // re-render on language change
```

## Common header

`MG.mountHeader(...)` renders a consistent header bar — a brand link back to the
games home, optional live stat chips, the language selector and action buttons:

```ts
const ui = MG.mountHeader({
  icon: "💣",
  titleKey: "title",
  stats: [{ key: "score", labelKey: "score" }],
  actions: [{ key: "new", labelKey: "new", onClick: newGame }],
});
ui.setStat("score", 42);
```

See [`CLAUDE.md`](./CLAUDE.md) for the full API.

## Adding a game (TypeScript)

1. Create `games/<name>/index.html`. Load the shared stylesheet and a single
   module entry point (the bundler emits the `.js`):

   ```html
   <link rel="stylesheet" href="../../shared/mg.css" />
   ...
   <script type="module" src="js/main.js"></script>
   ```

   Write your game as TypeScript ES modules (e.g. `games/<name>/js/main.ts`),
   importing the shared runtime directly:

   ```ts
   import { MG } from "../../../shared/mg";
   import type { HeaderUI } from "../../../shared/types";
   ```

   Use `<body class="mg-app">` with a `<div class="mg-game-area">` host, then
   `MG.i18n.register(...)` and `MG.mountHeader(...)`.

2. Add the game's entry point to the `GAMES` list in `build.ts` so it gets
   bundled.

3. Register it in `games.ts` (append to the exported `GAMES` array):

   ```ts
   export const GAMES: Game[] = [
     {
       title: "Snake",
       icon: "🐍",
       url: "./games/snake/",
       description: {
         en: "Eat, grow, don't bite yourself.",
         ru: "Ешь, расти, не кусай себя.",
         es: "Come, crece, no te muerdas.",
       },
     },
   ];
   ```

4. Run `bun run lint && bun run typecheck && bun run check && bun run build`,
   then commit and push to `main`.

## Local development

[Bun](https://bun.sh) ≥ 1.3 is the only prerequisite.

```sh
bun install      # install dev tooling (TypeScript, Biome)
bun run dev      # build, then serve dist/ at http://localhost:8000
bun run build    # build the site into dist/
bun run lint     # Biome lint + format check
bun run format   # Biome auto-fix
bun run typecheck# tsc --noEmit
bun run check    # validate the registry + project structure
```

## Deployment

Pushes to `main` trigger the **Deploy to GitHub Pages** workflow, which builds
the site with Bun and uploads `dist/`. A separate **CI** workflow runs lint,
type-check, structure validation and a build on every push and pull request.

One-time setup in the repo: **Settings → Pages → Build and deployment → Source:
GitHub Actions**. The custom domain `minigames.ryadom.me` is set via the `CNAME`
file; point a `CNAME` DNS record for `minigames` at `ryadom.github.io`.

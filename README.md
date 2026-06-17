# 🎮 Minigames

A collection of free browser minigames. No installs, no sign-ups — just play.

**Live site:** https://minigames.ryadom.me

> New games get added to the registry and show up on the home page
> automatically.
>
> **Games:** 💣 [Minesweeper](./games/minesweeper/) — infinite, pannable,
> zoomable Minesweeper · 🐤 [Flappy Bird](./games/flappy-bird/) — flap
> through the pipes.

## How it works

This is a **zero-build static site** — no bundler, no framework. The repository
root *is* the site, served straight from GitHub Pages. A game is a single
self-contained `index.html` you can even open directly from disk.

A small shared runtime gives every page consistent chrome:

- **`shared/mg.js`** (`window.MG`) — a shared language control and a common
  game header.
- **`shared/mg.css`** — the header-bar styles and shared theme tokens.

| Path                | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `index.html`        | Home page shell                                             |
| `styles.css`        | Home page styles                                            |
| `games.js`          | Registry of games (`window.GAMES`)                          |
| `app.js`            | Renders the game list + home language switch                |
| `shared/mg.js`      | Shared runtime: i18n + header (`window.MG`)                 |
| `shared/mg.css`     | Shared chrome styles                                        |
| `games/*/index.html`| Self-contained games                                        |
| `scripts/`          | Node dev server + structure validator                       |
| `CNAME`             | Custom domain (`minigames.ryadom.me`)                       |
| `.github/workflows/deploy.yml` | Deploys to GitHub Pages on push to `main`        |

## Language control

Languages (🇬🇧 EN / 🇷🇺 RU / 🇪🇸 ES) are handled in one place, `MG.i18n`. The
chosen language is stored once (`localStorage` key `mg.lang`) and **follows the
player across the home page and every game**. Each page registers its own
strings and the shared header + content re-render live when the language
changes.

```js
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

```js
var ui = MG.mountHeader({
  icon: "💣",
  titleKey: "title",
  stats: [{ key: "score", labelKey: "score" }],
  actions: [{ key: "new", labelKey: "new", onClick: newGame }],
});
ui.setStat("score", 42);
```

See [`CLAUDE.md`](./CLAUDE.md) for the full API.

## Adding a game

1. Create `games/<name>/index.html` and load the shared runtime in `<head>`:

   ```html
   <link rel="stylesheet" href="../../shared/mg.css" />
   <script src="../../shared/mg.js"></script>
   ```

   Use `<body class="mg-app">` with a `<div class="mg-game-area">` host, then
   `MG.i18n.register(...)` and `MG.mountHeader(...)`.

2. Register it in `games.js`:

   ```js
   window.GAMES = [
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

3. Run `npm run check`, then commit and push to `main`.

## Local development

No dependencies to install — the tooling uses only Node's standard library
(Node ≥ 18):

```sh
npm run dev      # serve at http://localhost:8000
npm run check    # validate the registry + project structure
```

(Any static file server works too, e.g. `python3 -m http.server 8000`.)

## Deployment

Pushes to `main` trigger the **Deploy to GitHub Pages** workflow, which uploads
the repository root as-is.

One-time setup in the repo: **Settings → Pages → Build and deployment → Source:
GitHub Actions**. The custom domain `minigames.ryadom.me` is set via the `CNAME`
file; point a `CNAME` DNS record for `minigames` at `ryadom.github.io`.

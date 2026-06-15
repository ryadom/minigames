# 🎮 Minigames

A collection of free browser minigames. No installs, no sign-ups — just play.

**Live site:** https://minigames.ryadom.me

> New games get added to the registry and show up on the home page
> automatically.
>
> **Games:** 💣 [Minesweeper](./games/minesweeper/) — infinite, pannable,
> zoomable Minesweeper.

## How it works

This is a plain static site (no build step). It is served straight from the
repository root by GitHub Pages.

| File          | Purpose                                            |
| ------------- | -------------------------------------------------- |
| `index.html`  | Home page shell                                    |
| `styles.css`  | Styles                                             |
| `games.js`    | Registry of available games (`window.GAMES`)       |
| `app.js`      | Renders the game list from the registry            |
| `CNAME`       | Custom domain (`minigames.ryadom.me`)              |
| `.github/workflows/deploy.yml` | Deploys to GitHub Pages on push to `main` |

## Adding a game

1. Create a folder for the game, e.g. `games/snake/`, with its own
   `index.html` and assets.
2. Register it in `games.js`:

   ```js
   window.GAMES = [
     {
       title: "Snake",
       description: "Eat, grow, don't bite yourself.",
       icon: "🐍",
       url: "./games/snake/",
     },
   ];
   ```

3. Commit and push to `main` — the GitHub Action redeploys automatically.

## Local preview

Any static file server works, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deployment

Pushes to `main` trigger the **Deploy to GitHub Pages** workflow.

One-time setup in the repo: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The custom domain `minigames.ryadom.me` is set via
the `CNAME` file; point a `CNAME` DNS record for `minigames` at
`ryadom.github.io`.

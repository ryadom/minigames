/* ============================================================================
 *  Test setup — a browser-like environment for Bun's test runner.
 *
 *  The shared runtime and the games are browser code: importing them runs
 *  top-level work that reaches for `document`, `navigator` and `localStorage`
 *  (language detection, the save store, PWA wiring). Bun runs tests in a plain
 *  JS environment, so we register a happy-dom window's globals here and load
 *  this file via `preload` in `bunfig.toml` before any test imports run.
 * ========================================================================== */
import { GlobalWindow } from "happy-dom";

// A site URL under games/<name>/ so the runtime's site-root detection (used by
// the PWA setup) resolves the same way it does in the deployed game.
const win = new GlobalWindow({ url: "https://minigames.ryadom.me/games/farm/" });

const g = globalThis as unknown as Record<string, unknown>;

// Mirror the DOM globals the runtime touches onto the test global. `window`
// itself is assigned last so `window.MG = …` in the runtime targets the same
// object the tests see.
const KEYS = [
  "document",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "history",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "CustomEvent",
  "Event",
  "Node",
  "Element",
  "HTMLElement",
  "HTMLDivElement",
  "HTMLSpanElement",
  "HTMLButtonElement",
  "HTMLAnchorElement",
  "HTMLSelectElement",
  "HTMLOptionElement",
  "HTMLInputElement",
  "HTMLLinkElement",
  "HTMLMetaElement",
] as const;

for (const key of KEYS) {
  g[key] = (win as unknown as Record<string, unknown>)[key];
}
g.window = win;

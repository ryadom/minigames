/* Ambient globals for the minigames site.
   The shared runtime publishes itself on `window.MG` for legacy games that
   still load it via a classic <script> tag; migrated games import it directly
   from shared/mg.ts. Either way the global is typed here. */

import type { MGGlobal } from "./shared/types";

declare global {
  interface Window {
    MG: MGGlobal;
  }

  /** The shared runtime, also reachable as a bare global in browser code. */
  const MG: MGGlobal;
}

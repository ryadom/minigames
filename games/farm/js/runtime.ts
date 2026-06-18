/* ============================================================================
 *  Farm — boot runtime singletons.
 *
 *  Holds the header UI handle and the DOM-ref bundle that the modules share.
 *  They are created in main.ts at boot and installed here via setRuntime();
 *  every other module reads them through the live `ui` / `dom` bindings (so
 *  references resolve at call time, after boot has run).
 * ========================================================================== */
import type { Dom, HeaderUI } from "./types";

export let ui: HeaderUI;
export let dom: Dom;

/** Install the header UI + DOM refs collected at boot (main.ts). */
export function setRuntime(headerUi: HeaderUI, domRefs: Dom): void {
  ui = headerUi;
  dom = domRefs;
}

// The entrypoint owns its shell so a returning player with cached prototype
// HTML can still boot the new game while the service worker refreshes the page.
export function mountShell(): void {
  document.body.innerHTML = `<!-- Header is mounted by the shared runtime (see MG.mountHeader in js/main.js). -->
  <div class="mg-game-area">
    <div class="farm-chrome" id="farmChrome">
      <div class="farm-heading"><div><h1 id="farmName"></h1><p id="farmSubtitle"></p></div><div class="modebar" id="modebar"></div></div>
      <nav class="quickbar" id="quickbar"></nav>
    </div>
    <div class="status">
      <span class="lvl" id="lvl">⭐ 1</span>
      <span class="xpwrap"><i id="xpfill"></i></span>
      <span class="store" id="store">📦 0/40</span>
    </div>
    <div class="world-view" id="worldView">
      <div class="world" id="world"></div>
      <div class="map-controls" id="mapControls"></div>
      <div class="build-hint" id="buildHint" role="status"></div>
      <div class="pan-hint" id="panHint"></div>
      <div class="catalog"><div class="catalog-heading" id="catalogTitle"></div><div class="toolbar" id="toolbar"></div></div>
    </div>
  </div>
  <div class="overlay" id="overlay" aria-hidden="true"></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <dialog id="helpDialog" aria-labelledby="helpTitle"><h2 id="helpTitle"></h2><p id="helpBody"></p><form method="dialog"><button id="helpClose" class="btn"></button></form></dialog>`;
  document
    .querySelector<HTMLLinkElement>('link[href*="farm.css"]')
    ?.setAttribute("href", "farm.css?v=2");
}

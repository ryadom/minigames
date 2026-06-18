/* ==========================================================================
   Minigames — service worker
   --------------------------------------------------------------------------
   Gives the static site offline support and makes it installable as a PWA.
   No build step: this file is served as-is from the repo root, so its scope
   is the whole site ("/"). It is registered by shared/mg.js, which every page
   and game loads.

   Strategy:
     • Precache the app shell (home page + shared runtime) on install so the
       site opens offline straight away.
     • Stale-while-revalidate for every other same-origin GET: serve the cached
       copy instantly when present and refresh it from the network in the
       background, so games are cached the first time they're visited and keep
       working offline afterwards.
     • Navigations fall back to the cached home page when offline and the
       requested page hasn't been cached yet.

   Bump CACHE when the precached shell changes to retire stale caches.
   ========================================================================== */
"use strict";

var CACHE = "mg-cache-v1";

// App shell — resolved relative to this script's location (the site root).
var SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./games.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./shared/mg.js",
  "./shared/mg.css",
  "./shared/cards.js",
  "./shared/cards.css",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Tolerate individual misses (e.g. a renamed shell file) so a single
      // 404 doesn't abort the whole install.
      return Promise.all(
        SHELL.map(function (url) {
          return cache.add(new Request(url, { cache: "reload" })).catch(function () {});
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) { return k === CACHE ? null : caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;

  // Only handle same-origin GETs; let the browser deal with the rest.
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          // Cache successful, basic (same-origin) responses for next time.
          if (res && res.status === 200 && res.type === "basic") {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(function () {
          // Offline: for navigations, fall back to the cached home page.
          if (req.mode === "navigate") return cache.match("./index.html");
          return undefined;
        });

        // Stale-while-revalidate: cached copy now, network refresh in flight.
        return cached || network;
      });
    })
  );
});

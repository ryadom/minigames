/* ==========================================================================
   Minigames — service worker
   --------------------------------------------------------------------------
   Gives the static site offline support and makes it installable as a PWA.
   Compiled from TypeScript to a classic script served from the repo root, so
   its scope is the whole site ("/"). It is registered by the shared runtime,
   which every page and game loads.

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

// The service-worker global scope isn't part of the DOM lib this project type-
// checks against, so model just the bits we use and view `self` through it.
interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEventLike {
  readonly request: Request;
  respondWith(response: Response | Promise<unknown>): void;
}
interface ServiceWorkerGlobal {
  addEventListener(type: "install", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "activate", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: { origin: string };
}

const sw = self as unknown as ServiceWorkerGlobal;

const CACHE = "mg-cache-v3";

// App shell — resolved relative to this script's location (the site root).
const SHELL: string[] = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./shared/mg.css",
  "./shared/cards.css",
];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // Tolerate individual misses (e.g. a renamed shell file) so a single
        // 404 doesn't abort the whole install.
        Promise.all(
          SHELL.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {})),
        ),
      )
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k)))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle same-origin GETs; let the browser deal with the rest.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            // Cache successful, basic (same-origin) responses for next time.
            if (res && res.status === 200 && res.type === "basic") {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => {
            // Offline: for navigations, fall back to the cached home page.
            if (req.mode === "navigate") return cache.match("./index.html");
            return undefined;
          });

        // Stale-while-revalidate: cached copy now, network refresh in flight.
        return cached || network;
      }),
    ),
  );
});

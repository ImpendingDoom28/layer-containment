// Service worker for the Layer Containment PWA. Makes the game loadable
// offline after the first online visit: the app shell (HTML, manifest,
// icons, and the built assets the HTML references) is precached at install,
// navigations are network-first with an offline fallback to the cached
// shell, and other same-origin assets are served cache-first with a
// background refresh.
const CACHE_NAME = "layer-containment-v1";

const INDEX = new URL("index.html", self.location.href).href;

const SHELL = [
  INDEX,
  new URL("manifest.webmanifest", self.location.href).href,
  new URL("pwa/pwa-icon-192.png", self.location.href).href,
  new URL("pwa/pwa-icon-512.png", self.location.href).href,
  new URL("pwa/pwa-icon-maskable-192.png", self.location.href).href,
  new URL("pwa/pwa-icon-maskable-512.png", self.location.href).href,
];

// The built index.html references hashed JS/CSS bundles by name, so the
// precache list is derived from it at install time (a static precache
// list would go stale on every rebuild).
const parseAssetUrls = (html, baseUrl) => {
  const urls = new Set();
  const patterns = [/<script[^>]+src="([^"]+)"/g, /<link[^>]+href="([^"]+)"/g];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      try {
        urls.add(new URL(match[1], baseUrl).href);
      } catch {
        // Skip values that are not URLs.
      }
    }
  }
  return [...urls];
};

const putInCache = (request, response) => {
  const copy = response.clone();
  return caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL);
      const index = await fetch(INDEX);
      await cache.addAll(parseAssetUrls(await index.text(), INDEX));
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, falling back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a successful response may replace the cached shell:
          // HTTP error responses (404/500) would otherwise poison the
          // offline fallback with an error page.
          if (response.ok) {
            event.waitUntil(putInCache(new Request(INDEX), response));
          }
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ?? (await caches.match(INDEX));
          return cached ?? Response.error();
        })
    );
    return;
  }

  // Static assets: cache-first with a background refresh.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // waitUntil keeps the worker alive until the refresh and its
        // cache write finish, so the refresh is not dropped.
        event.waitUntil(
          fetch(request)
            .then((response) =>
              response.ok ? putInCache(request, response) : undefined
            )
            .catch(() => undefined)
        );
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          event.waitUntil(putInCache(request, response));
        }
        return response;
      });
    })
  );
});

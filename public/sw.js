// Service worker for the Layer Containment PWA. Makes the game loadable
// offline after the first online visit: the app shell (HTML, manifest,
// icons) is precached at install, navigations are network-first with an
// offline fallback to the cached shell, and other same-origin assets are
// served cache-first with a background refresh.
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

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
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

const putInCache = (request, response) => {
  const copy = response.clone();
  void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
};

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
          putInCache(new Request(INDEX), response);
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match(INDEX)) ?? Response.error())
    );
    return;
  }

  // Static assets: cache-first with a background refresh.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) putInCache(request, response);
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});

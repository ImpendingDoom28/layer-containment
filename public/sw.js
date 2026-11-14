// Layer Containment service worker.
//
// Serves only fully-cached, versioned app shells. A version is a hash of the
// complete deploy: every asset URL referenced by the built index.html plus a
// static list of runtime-loaded URLs (models, audio, configs — loaded by the
// app after boot, so index.html alone can't cover them). A new deploy
// produces a new version; the old version's caches stay intact until the new
// one is fully precached, so a broken deploy can never leave the user with a
// dead page: the game always boots from the last fully-downloaded version.
//
// The service worker is the single source of truth for the current version:
// install precaches the version of the deployed shell and records it in the
// meta cache. The app-side updater (the page pings it with a
// "check-for-update" message) fresh-fetches the live index, computes its
// version, and precaches it in the background under a hard timeout. No
// build-time version constant is shared between the app and the SW.

const PREFIX = "lc-";
const SHELL_PREFIX = `${PREFIX}shell-`;
const ASSETS_PREFIX = `${PREFIX}assets-`;
const META_CACHE = `${PREFIX}meta`;
// Meta cache key: the version the installed shell belongs to.
const CURRENT_VERSION_KEY = "current-version";
// Hard cap for a background update: a slow network gets "retry next time"
// instead of a multi-minute download.
const UPDATE_TIMEOUT_MS = 30000;
// Marker query for "fetch the live network, never the cache" requests. The
// SW's own fresh fetches carry it; a fetch from inside the SW is
// intercepted by the SW's own fetch handler, which passes it straight to the
// network.
const FRESH_QUERY = "src=fresh";

// Assets the app loads at runtime (not referenced by index.html). Kept in
// sync with the app's sources: enemy/base/tower model URLs in
// src/constants/models.ts, tower model URLs in public/configs/game.json
// (towerTypes.<type>.model.url), the audio files in
// src/core/audio/gameSoundConfig.ts, and the level configs loaded through
// src/utils/fileLoader.ts (configs/levels/<id>.json).
const STATIC_ASSETS = [
  // Enemies (with the same cache-busting version queries the app uses).
  "assets/models/troop.glb?v=2",
  "assets/models/wraith.glb?v=3",
  "assets/models/medic.glb?v=2",
  "assets/models/splitter.glb?v=2",
  "assets/models/tankee.glb?v=2",
  // Terrain rubble props.
  "assets/models/rubble_1.glb",
  "assets/models/rubble_2.glb",
  "assets/models/rubble_3.glb",
  "assets/models/rubble_4.glb",
  "assets/models/rubble_5.glb",
  "assets/models/rubble_6.glb",
  // Player base.
  "assets/models/player_base.glb?v=2",
  // Towers (URLs live in public/configs/game.json, towerTypes.<type>.model).
  "assets/models/tower_basic.glb?v=2",
  "assets/models/tower_aoe.glb?v=2",
  "assets/models/tower_chain.glb?v=2",
  "assets/models/tower_laser.glb?v=2",
  "assets/models/tower_relay.glb?v=2",
  "assets/models/tower_slow.glb?v=2",
  // Audio (src/core/audio/gameSoundConfig.ts).
  "assets/audio/laser-shot.wav",
  "assets/audio/basic-shot.mp3",
  // Game config (src/core/configs/gameConfig.ts).
  "configs/game.json",
  // Level configs (src/utils/fileLoader.ts loads configs/levels/<id>.json
  // for the playable levels plus level_main, level_testing and the stress
  // level).
  "configs/levels/level_main.json",
  "configs/levels/level_1.json",
  "configs/levels/level_2.json",
  "configs/levels/level_3.json",
  "configs/levels/level_4.json",
  "configs/levels/level_testing.json",
  "configs/levels/stress.json",
];

// ---- Version hashing -------------------------------------------------------

// Fast non-cryptographic hash (FNV-1a, 32-bit) as a hex string. Only needs
// to be stable and collision-resistant enough to distinguish deploys.
const hashString = (text) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

// Absolute URL with the fresh-fetch marker appended.
const freshUrl = (url) => `${url}${url.includes("?") ? "&" : "?"}${FRESH_QUERY}`;

// Extract asset URLs (script src / link href) from HTML, resolved to
// absolute URLs.
const parseAssetUrls = (html, baseUrl) => {
  const urls = [];
  const scriptRe = /<script[^>]+src="([^"]+)"/g;
  const linkRe = /<link[^>]+href="([^"]+)"/g;
  for (const match of html.matchAll(scriptRe)) {
    urls.push(match[1]);
  }
  for (const match of html.matchAll(linkRe)) {
    urls.push(match[1]);
  }
  return urls
    .filter((url) => !url.startsWith("data:"))
    .map((url) => new URL(url, baseUrl).toString());
};

// The version key: a hash over the sorted union of every URL in the deploy
// (index.html references + the static runtime list).
const computeVersion = async (base = self.location.href, signal) => {
  const root = new URL("./", base);
  const response = await fetch(freshUrl(root.toString()), {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Index fetch failed (${response.status})`);
  }
  const html = await response.text();
  const urls = new Set(
    [...parseAssetUrls(html, root.toString()), ...STATIC_ASSETS].map(
      (url) => new URL(url, root.toString()).toString()
    )
  );
  return hashString([...urls].sort().join("\n"));
};

// ---- Caches ----------------------------------------------------------------

const shellCacheName = (version) => `${SHELL_PREFIX}${version}`;
const assetsCacheName = (version) => `${ASSETS_PREFIX}${version}`;

// A version is only current once every one of its entries is cached, so a
// single failed response must fail the whole precache (the catch in
// precacheVersion rolls the partial caches back).
const putInCache = async (cache, url, response) => {
  if (!response.ok) {
    throw new Error(`Precache failed for ${url} (${response.status})`);
  }
  await cache.put(url, response.clone());
};

const deleteVersionCaches = async (version) => {
  await Promise.all([
    caches.delete(shellCacheName(version)),
    caches.delete(assetsCacheName(version)),
  ]);
};

// Precaches a full version: the shell (index + everything index.html
// references) and the static runtime assets, then records it as the current
// version in the meta cache. The meta write happens only after every entry
// is cached, so the current version always points at a complete cache.
const precacheVersion = async (version, signal) => {
  try {
    const root = new URL("./", self.location.href);
    const indexResponse = await fetch(freshUrl(root.toString()), {
      cache: "no-store",
      signal,
    });
    if (!indexResponse.ok) {
      throw new Error(`Index fetch failed (${indexResponse.status})`);
    }
    const html = await indexResponse.text();
    const shellUrls = [
      root.toString(),
      ...parseAssetUrls(html, root.toString()),
    ];

    const shellCache = await caches.open(shellCacheName(version));
    const assetsCache = await caches.open(assetsCacheName(version));
    await Promise.all(
      [...shellUrls, ...STATIC_ASSETS].map((url) => {
        const absolute = new URL(url, root.toString()).toString();
        return fetch(freshUrl(absolute), { cache: "no-store", signal }).then(
          (response) =>
            putInCache(
              absolute === root.toString() ? shellCache : assetsCache,
              absolute,
              response
            )
        );
      })
    );

    const metaCache = await caches.open(META_CACHE);
    await metaCache.put(
      CURRENT_VERSION_KEY,
      new Response(JSON.stringify({ version }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch (error) {
    await deleteVersionCaches(version);
    throw error;
  }
};

// ---- Fetch handling --------------------------------------------------------

const getCurrentVersion = async () => {
  const metaCache = await caches.open(META_CACHE);
  const entry = await metaCache.match(CURRENT_VERSION_KEY);
  return entry ? (await entry.json()).version : null;
};

// Navigations are served only from the fully-precached shell of the current
// version; a first visit without any cache falls through to the network
// (the install/activate cycle caches it). A broken deploy can't produce a
// dead page because the current version's shell is always complete.
//
// The app is a single-page app: only the index URL itself is precached, so
// any other navigation (e.g. /editor, an SPA route) serves the same cached
// shell and lets the client-side router take over. That also covers an
// offline visit to a sub-route — the network fetch for it would just fail.
const navigate = async (request) => {
  const version = await getCurrentVersion();
  if (version) {
    const shellCache = await caches.open(shellCacheName(version));
    const exact = await shellCache.match(request.url);
    if (exact) {
      return exact;
    }
    const root = await shellCache.match(new URL("./", self.location.href));
    if (root) {
      return root;
    }
  }
  return fetch(request);
};

// Runtime assets: cache-first from the current version's caches (shell
// assets live in the shell cache, runtime assets in the asset cache), with a
// network fallback for anything not precached (and the miss is cached in the
// asset cache so the next load is fully offline-capable).
const serveAsset = async (request) => {
  const version = await getCurrentVersion();
  if (version) {
    const [shellCache, assetsCache] = await Promise.all([
      caches.open(shellCacheName(version)),
      caches.open(assetsCacheName(version)),
    ]);
    const cached =
      (await shellCache.match(request.url)) ??
      (await assetsCache.match(request.url));
    if (cached) {
      return cached;
    }
  }
  const response = await fetch(request);
  if (response.ok && version) {
    // caches.open() is async — await it before .put(), or the miss is never
    // cached and the pending promise rejects the response. A failing
    // cache write (e.g. QuotaExceededError on a full storage) must not
    // discard a successful live response: the miss stays uncached and the
    // next load retries the fallback.
    try {
      await (await caches.open(assetsCacheName(version))).put(
        request.url,
        response.clone()
      );
    } catch {
      // Response is still returned uncached.
    }
  }
  return response;
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // On a fresh install the current version is simply the deployed one.
      // A failed install rejects, the old service worker (if any) keeps
      // serving, and the next install attempt retries.
      const version = await computeVersion();
      await precacheVersion(version);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const metaCache = await caches.open(META_CACHE);
      const entry = await metaCache.match(CURRENT_VERSION_KEY);
      const version = entry
        ? (await entry.json()).version
        : await computeVersion();
      const keep = [
        META_CACHE,
        shellCacheName(version),
        assetsCacheName(version),
      ];
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !keep.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isFresh = url.searchParams.get("src") === "fresh";

  // Cache-bypass requests (the SW's own fresh fetches): straight to the
  // network, no cache involvement.
  if (isFresh) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }

  event.respondWith(serveAsset(request));
});

// ---- Background update (app-triggered) ------------------------------------

// The app pings the SW with a "check-for-update" message on boot. Computes
// the live version, precaches it under a hard timeout, and posts the
// outcome back: up-to-date / update-ready / update-failed.
//
// Being unable to *reach* the network is not a failure: it just means there
// is nothing to download (the user is offline and the game already runs on
// the last cached version), so it reports "up-to-date" — a "failure" banner
// would be noise for an offline player.
const checkForUpdate = async () => {
  try {
    const currentVersion = await getCurrentVersion();
    if (!currentVersion) {
      return { status: "up-to-date", version: await computeVersion() };
    }

    // The whole update — discovering the live version (a fresh index fetch)
    // plus the precache — lives inside the hard budget, so a slow index
    // alone can't stall the check forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
    let liveVersion;
    try {
      liveVersion = await computeVersion(self.location.href, controller.signal);
      if (liveVersion === currentVersion) {
        return { status: "up-to-date", version: liveVersion };
      }
      await precacheVersion(liveVersion, controller.signal);
    } finally {
      clearTimeout(timer);
    }

    // The new version is fully cached and now current; the app reloads on
    // "update-ready", booting the new shell.
    return { status: "update-ready", version: liveVersion };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("failed to fetch") || message.includes("network")) {
      return { status: "up-to-date", version: null, reason: "offline" };
    }
    return {
      status: "update-failed",
      reason: message,
    };
  }
};

self.addEventListener("message", (event) => {
  const data = event.data;
  // The event's source window is only guaranteed to be alive while the
  // handler runs synchronously (a service worker detaches the MessageEvent
  // once its handlers return), so the reply channel is captured up front —
  // the update below can take up to 30s before it answers.
  const source = event.source;
  if (data && data.type === "check-for-update") {
    event.waitUntil(
      checkForUpdate().then((result) => {
        source?.postMessage(result);
      })
    );
  }
});

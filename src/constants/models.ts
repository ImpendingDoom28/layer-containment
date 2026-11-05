import { useGLTF } from "@react-three/drei";

import type { EnemyType } from "../core/types/game";

// Served from `public/` at the app root (relative, matching the audio assets in
// `core/audio/gameSoundConfig.ts`). Vite's `base: "./"` keeps this correct under
// both the BrowserRouter (http) and HashRouter (file:// Electron) setups.
// Each enemy is shipped as its own standalone GLB (extracted one node at a time
// from the Tower Defense entities collection) instead of the whole collection,
// so the app only downloads the models it renders.
export type EnemyModelSpec = {
  url: string;
  /** Name of the model root node inside the GLB. */
  node: string;
};

export const ENEMY_MODELS = {
  basic: {
    url: "assets/models/troop.glb",
    node: "Enemy_Basic_ROOT",
  },
  fast: {
    // Versioned query: the file replaced the previous wraith.glb in place, but
    // the PWA service worker serves cached `assets/` URLs cache-first. A
    // returning install would otherwise load the old file (root node
    // `W02_Wraith_ROOT`) and, finding no `Enemy_Fast_ROOT`, render nothing.
    url: "assets/models/wraith.glb?v=2",
    node: "Enemy_Fast_ROOT",
  },
  medic: {
    url: "assets/models/medic.glb",
    node: "Enemy_Medic_ROOT",
  },
  splitter: {
    url: "assets/models/splitter.glb",
    node: "Enemy_Splitter_ROOT",
  },
  tank: {
    url: "assets/models/tankee.glb",
    node: "Enemy_Tank_ROOT",
  },
} as const satisfies Record<EnemyType, EnemyModelSpec>;

// Every enemy model faces the same way: the nose points along the model's
// local +Z, so rotating PI/2 about Y turns it toward the enemy's local +X
// (its direction of travel).
export const ENEMY_MODEL_ROTATION_Y = Math.PI / 2;

// The player base (the end building at the end of every path), extracted from
// the Tower Defense entities collection as its own standalone GLB. Its rest
// transform is already the one the scene wants (grounded at y = 0, centered
// on x/z), so `EndBuilding` renders it as-is (see `prepareBaseModel`).
export const BASE_MODEL: EnemyModelSpec = {
  url: "assets/models/player_base.glb",
  node: "Player_Base_ROOT",
};

// Tower model URLs live in the game config (`public/configs/game.json`,
// `towerTypes.<type>.model`), so they are not known at module load: the enemy
// and base models are preloaded at boot (below), and the tower models are
// preloaded once the config has loaded — `GamePage` awaits them via
// `getAreModelsLoaded`, which receives their URLs at that point.

// The models known at module load: every enemy plus the player base (the
// base is static — no config lookup — so it preloads with the enemies, which
// also keeps the level editor, which has no loading gate, from ever showing
// the base's primitive fallback for long).
const BOOT_MODEL_URLS = [
  ...Object.values(ENEMY_MODELS).map((model) => model.url),
  BASE_MODEL.url,
];

// Kick off the enemy and base GLB downloads the moment the module is first
// evaluated (app boot, outside the Canvas) so the first wave of any enemy type
// and the base at every path end never suspend the whole scene into the
// loading screen. Guarded for the node test environment, which has no network
// and never mounts the game scene.
if (!import.meta.env["VITEST"]) {
  for (const url of BOOT_MODEL_URLS) {
    useGLTF.preload(url);
  }
}

// Hard cap on how long the loading screen waits for models, so a stalled or
// unreachable download can never hang the overlay (a failed 404 settles on its
// own and is handled by the per-model error boundary, degrading that one model
// to its fallback).
const MODEL_LOAD_TIMEOUT_MS = 15_000;

let modelLoad: Promise<void> | null = null;

/**
 * Resolves once every model load has settled — loaded, failed, or hit the
 * timeout cap. `lookups` are called like `useGLTF(url)` outside React: each
 * either returns its cached parse (already loaded) or throws the in-flight
 * load's promise (still loading). A settled error (a 404, a parse failure) is
 * thrown synchronously instead. `Promise.allSettled` absorbs failures, so one
 * broken model degrades to its fallback rather than hanging the whole screen,
 * and the timeout guarantees the promise always resolves even if a load stalls
 * forever.
 */
export const settleModelLoads = (
  lookups: Array<() => unknown>,
  timeoutMs: number,
): Promise<void> => {
  const loads: Promise<unknown>[] = lookups.map((lookup) => {
    try {
      lookup(); // cached: returns the parse synchronously
      return Promise.resolve();
    } catch (error) {
      // Not cached yet: the throw is either the in-flight load's promise (wait
      // on it) or a settled error (surface it as a rejection, not a hang).
      if (error && typeof (error as Promise<unknown>).then === "function") {
        return error as Promise<unknown>;
      }
      return Promise.reject(error);
    }
  });

  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, timeoutMs),
  );

  return Promise.race([
    Promise.allSettled(loads).then(() => undefined),
    timeout,
  ]);
};

/**
 * Resolves once every model GLB has finished loading (or failed, or hit the
 * timeout). The loading screen waits on this (see `GamePage`) so the first
 * visible frame shows a fully-populated scene instead of an empty board that
 * fills in as the models stream in.
 *
 * `towerModelUrls` are the tower model URLs from the game config, which are
 * only known once the config has loaded — so this is called with them at that
 * point (see `GamePage`), while the enemy and base models are already
 * preloaded at boot.
 * `useGLTF` is fire-and-forget for preloading, so readiness is tracked here
 * instead, via the same `useGLTF` call the scene will make: outside React it
 * returns the cached parse or throws the in-flight load's promise, which
 * `settleModelLoads` captures and settles on.
 */
export const getAreModelsLoaded = (towerModelUrls: string[]): Promise<void> => {
  if (modelLoad) return modelLoad;

  if (import.meta.env["VITEST"]) {
    // Node test environment: no network, the game scene never mounts, and the
    // unit tests never render models — treat as immediately ready.
    modelLoad = Promise.resolve();
    return modelLoad;
  }

  const allModelUrls = [...BOOT_MODEL_URLS, ...towerModelUrls];
  modelLoad = settleModelLoads(
    allModelUrls.map((url) => () => useGLTF(url)),
    MODEL_LOAD_TIMEOUT_MS,
  );
  return modelLoad;
};

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

// Every model faces the same way: the nose points along the model's local +Z,
// so rotating PI/2 about Y turns it toward the enemy's local +X (its direction
// of travel).
export const ENEMY_MODEL_ROTATION_Y = Math.PI / 2;

// Kick off all GLB downloads the moment the module is first evaluated (app
// boot, outside the Canvas) so the first wave of any enemy type never
// suspends the whole scene into the loading screen. Guarded for the node test
// environment, which has no network and never mounts the game scene.
if (!import.meta.env["VITEST"]) {
  for (const model of Object.values(ENEMY_MODELS)) {
    useGLTF.preload(model.url);
  }
}

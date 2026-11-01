import { useGLTF } from "@react-three/drei";

// Served from `public/` at the app root (relative, matching the audio assets in
// `core/audio/gameSoundConfig.ts`). Vite's `base: "./"` keeps this correct under
// both the BrowserRouter (http) and HashRouter (file:// Electron) setups.
// The Wraith extracted on its own (the full Monolith collection is not shipped).
export const WRAITH_MODEL_URL = "assets/models/wraith.glb";

// The drone root node inside wraith.glb. The nose points along the model's
// local +Z; rotating it PI/2 about Y turns the nose toward the enemy's local
// +X (its direction of travel).
export const WRAITH_NODE = "W02_Wraith_ROOT";

// Yaw that aligns the Wraith's nose (model +Z) with the enemy's direction of
// travel (the enemy group's local +X).
export const WRAITH_ROTATION_Y = Math.PI / 2;

// Kick off the GLB download the moment the module is first evaluated (app
// boot, outside the Canvas) so the first fast enemy never suspends the whole
// scene into the loading screen. Guarded for the node test environment, which
// has no network and mocks `useGLTF` instead.
if (!import.meta.env["VITEST"]) {
  useGLTF.preload(WRAITH_MODEL_URL);
}

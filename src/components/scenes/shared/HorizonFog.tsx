import { FC, memo } from "react";

import { getCssColorValue } from "../../ui/lib/cssUtils";

// Camera distances at which the fog begins and becomes fully opaque. Tuned so
// the board (a few tens of units out) stays clear while the planet's far rim
// (well past 60 units) melts into the skybox — softening the horizon curve and
// hiding the hard edge where the sphere meets the sky.
const FOG_NEAR = 15;
const FOG_FAR = 60;

/**
 * A subtle scene fog matched to `scene-sky-base` that fades the planet's
 * distant rim into the sky, softening the horizon curve and hiding the hard
 * edge where the sphere meets the skybox. It is attached via `scene.fog`, so
 * the standard materials (ground, tiles, towers, enemies, water) pick it up
 * automatically. The skybox and stars are shader materials with no fog chunks,
 * so only the planet and its contents are affected — the planet melts into the
 * same near-black the sky already is. Static (no per-frame work).
 */
export const HorizonFog: FC = memo(() => (
  <fog
    attach="fog"
    args={[getCssColorValue("scene-sky-base"), FOG_NEAR, FOG_FAR]}
  />
));

HorizonFog.displayName = "HorizonFog";

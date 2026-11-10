import { FC, memo } from "react";

import { getCssColorValue } from "../../ui/lib/cssUtils";

type HorizonFogProps = {
  /**
   * Distance from the camera at which the fog becomes fully opaque. Defaults to
   * the game/menu tuning. The testing-level scene passes a larger value so its
   * orbit camera can zoom far out without the board becoming fully fogged.
   */
  far?: number;
};

// Camera distance at which the fog begins. Tuned so the fog is a visible haze
// even from the default down-angled gameplay view (the board is a few tens of
// units out).
const FOG_NEAR = 6;
// Camera distance at which the fog is fully opaque (game/menu default). Tuned
// so the planet's far rim (well past 40 units) melts into the skybox,
// softening the horizon curve and hiding the hard edge where the sphere meets
// the sky.
const FOG_FAR = 40;

/**
 * A subtle scene fog matched to `scene-sky-base` that fades the planet into
 * the sky: from the default camera it reads as a thin haze over the far side
 * of the board, and when the camera tilts up the planet's rim fully melts into
 * the skybox, hiding the hard edge where the sphere meets the sky. It is
 * attached via `scene.fog`, so the standard materials (ground, tiles, towers,
 * enemies, water) pick it up automatically. The skybox and stars are shader
 * materials with no fog chunks, so only the planet and its contents are
 * affected — the planet melts into the same near-black the sky already is.
 * Static (no per-frame work).
 */
export const HorizonFog: FC<HorizonFogProps> = memo(({ far = FOG_FAR }) => (
  <fog
    attach="fog"
    args={[getCssColorValue("scene-sky-base"), FOG_NEAR, far]}
  />
));

HorizonFog.displayName = "HorizonFog";

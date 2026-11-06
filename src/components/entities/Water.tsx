import { FC, memo, useMemo } from "react";

import type { WaterBody as WaterBodyInstance } from "../../core/types/game";
import { getWaterMaterial, WATER_AMPLITUDE } from "../../utils/waterMaterial";
import { useWaterClock } from "../../core/contexts/WaterClockContext";
import { getCssColorValue } from "../ui/lib/cssUtils";

type WaterProps = {
  water: WaterBodyInstance;
};

export const Water: FC<WaterProps> = memo(({ water }) => {
  const { time } = useWaterClock();
  const emissiveHue = getCssColorValue("scene-water-emissive");

  // One shared material per body color+size on the scene's single water
  // clock; the body only re-renders if the water body itself changes. The
  // swell amplitude matches the water tiles (WATER_AMPLITUDE) that share this
  // body's cells, and the top face sits at local y = height/2 (box and
  // cylinder alike), so the top face is subdivided enough for the
  // displacement to actually swell.
  const material = useMemo(
    () =>
      getWaterMaterial(
        water.color,
        time,
        emissiveHue,
        WATER_AMPLITUDE,
        water.height / 2
      ),
    [water.color, water.height, time, emissiveHue]
  );

  // The water body and the water tiles in the same cells both swell with the
  // shared wave field at WATER_AMPLITUDE, so their top faces move in lockstep
  // and the (time-constant) gap between them never crosses — no flicker.
  // The body sits 0.03 below the tile surface so it reads as a deeper pool
  // that peeks through the tile's troughs instead of floating above the shore.
  const yPosition = water.height / 2 - 0.03;

  return (
    <group position={[water.x, 0, water.z]}>
      {water.shape === "box" ? (
        <mesh position={[0, yPosition, 0]} material={material} receiveShadow>
          <boxGeometry args={[water.width, water.height, water.depth, 8, 1, 8]} />
        </mesh>
      ) : (
        <mesh position={[0, yPosition, 0]} material={material} receiveShadow>
          <cylinderGeometry
            args={[
              water.width / 2,
              water.width / 2,
              water.height,
              16,
              3,
            ]}
          />
        </mesh>
      )}
    </group>
  );
});

Water.displayName = "Water";

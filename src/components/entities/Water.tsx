import { FC, memo, useMemo } from "react";

import type { WaterBody as WaterBodyInstance } from "../../core/types/game";
import { getWaterMaterial } from "../../utils/waterMaterial";
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
  // swell amplitude is half the body height and the top face sits at local
  // y = height/2 (box and cylinder alike), so the top face is subdivided
  // enough for the displacement to actually swell.
  const material = useMemo(
    () =>
      getWaterMaterial(
        water.color,
        time,
        emissiveHue,
        water.height / 2,
        water.height / 2
      ),
    [water.color, water.height, time, emissiveHue]
  );

  // Bodies sit below the water-tile surface (tiles are recessed 0.05 below
  // the land plane and swell ±~0.034) so a body reads as a deeper pool that
  // peeks through the tile's troughs instead of floating above the shore.
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

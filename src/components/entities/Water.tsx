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

  // One shared material per body color, animated by the scene's single water
  // clock; the body stays a plain static mesh that only re-renders if the
  // water body itself changes.
  const material = useMemo(
    () => getWaterMaterial(water.color, time, emissiveHue),
    [water.color, time, emissiveHue]
  );

  const yPosition = water.height / 2;

  return (
    <group position={[water.x, 0, water.z]}>
      {water.shape === "box" ? (
        <mesh position={[0, yPosition, 0]} material={material} receiveShadow>
          <boxGeometry args={[water.width, water.height, water.depth]} />
        </mesh>
      ) : (
        <mesh position={[0, yPosition, 0]} material={material} receiveShadow>
          <cylinderGeometry
            args={[water.width / 2, water.width / 2, water.height, 16]}
          />
        </mesh>
      )}
    </group>
  );
});

Water.displayName = "Water";

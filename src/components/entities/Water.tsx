import { FC, memo } from "react";

import type { WaterBody as WaterBodyInstance } from "../../core/types/game";
import { getCssColorValue } from "../ui/lib/cssUtils";

type WaterProps = {
  water: WaterBodyInstance;
};

export const Water: FC<WaterProps> = memo(({ water }) => {
  const yPosition = water.height / 2;
  const emissiveHue = getCssColorValue("scene-water-emissive");

  return (
    <group position={[water.x, 0, water.z]}>
      {water.shape === "box" ? (
        <mesh position={[0, yPosition, 0]} receiveShadow>
          <boxGeometry args={[water.width, water.height, water.depth]} />
          <meshStandardMaterial
            color={water.color}
            emissive={emissiveHue}
            emissiveIntensity={0.14}
            metalness={0.28}
            roughness={0.18}
          />
        </mesh>
      ) : (
        <mesh position={[0, yPosition, 0]} receiveShadow>
          <cylinderGeometry
            args={[water.width / 2, water.width / 2, water.height, 16]}
          />
          <meshStandardMaterial
            color={water.color}
            emissive={emissiveHue}
            emissiveIntensity={0.14}
            metalness={0.28}
            roughness={0.18}
          />
        </mesh>
      )}
    </group>
  );
});

Water.displayName = "Water";

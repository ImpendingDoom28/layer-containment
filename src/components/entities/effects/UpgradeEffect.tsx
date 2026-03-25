import { FC, memo, type Ref } from "react";
import type { Mesh } from "three";
import { TorusGeometry } from "three";

const UPGRADE_RING_TORUS_GEOMETRY = new TorusGeometry(1, 0.018, 6, 16);

type UpgradeEffectProps = {
  enemySize: number;
  indicatorColors: string[];
  firstRingRef: Ref<Mesh>;
};

export const UpgradeEffect: FC<UpgradeEffectProps> = memo(
  ({ enemySize, indicatorColors, firstRingRef }) => {
    if (indicatorColors.length === 0) return null;

    return (
      <group position={[0, enemySize * 0.3, 0]}>
        {indicatorColors.map((color, index) => {
          const ringRadius = enemySize * (1.1 + index * 0.15);

          return (
            <mesh
              key={`${color}-${index}`}
              ref={index === 0 ? firstRingRef : undefined}
              geometry={UPGRADE_RING_TORUS_GEOMETRY}
              position={[0, index * 0.15, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[ringRadius, ringRadius, ringRadius]}
            >
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.65}
                transparent
                opacity={0.75}
              />
            </mesh>
          );
        })}
      </group>
    );
  }
);

UpgradeEffect.displayName = "UpgradeEffect";

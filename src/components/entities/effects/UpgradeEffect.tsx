import { FC, memo, useRef } from "react";
import { Mesh } from "three";
import { useFrame } from "@react-three/fiber";

import { EnemyUpgradeId } from "../../../core/types/game";
import {
  enemyUpgradesSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { getCssColorValue } from "../../ui/lib/cssUtils";

type UpgradeEffectProps = {
  enemySize: number;
  upgrades: EnemyUpgradeId[];
  shouldStopMovement: boolean;
};

export const UpgradeEffect: FC<UpgradeEffectProps> = memo(
  ({ enemySize, upgrades, shouldStopMovement }) => {
    const enemyUpgrades = useGameStore(enemyUpgradesSelector);
    const ringRef = useRef<Mesh>(null);

    useFrame((state) => {
      if (shouldStopMovement) return;
      const time = state.clock.elapsedTime;

      if (ringRef.current) {
        ringRef.current.rotation.y = time * 1.5;
        const pulse = Math.sin(time * 2) * 0.05 + 1;
        ringRef.current.scale.set(pulse, pulse, pulse);
      }
    });

    if (!enemyUpgrades || upgrades.length === 0) return null;

    // Get the primary upgrade color (first upgrade)
    const primaryUpgrade = enemyUpgrades[upgrades[0]];
    const primaryColor =
      primaryUpgrade?.indicatorColor ?? getCssColorValue("scene-white");

    return (
      <group position={[0, enemySize * 0.3, 0]}>
        {/* Ring for each upgrade, stacked vertically */}
        {upgrades.map((upgradeId, index) => {
          const upgrade = enemyUpgrades[upgradeId];
          if (!upgrade) return null;

          return (
            <mesh
              key={upgradeId}
              ref={index === 0 ? ringRef : undefined}
              position={[0, index * 0.15, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <torusGeometry
                args={[enemySize * (1.1 + index * 0.15), 0.02, 8, 24]}
              />
              <meshStandardMaterial
                color={upgrade.indicatorColor}
                emissive={upgrade.indicatorColor}
                emissiveIntensity={0.5}
                transparent
                opacity={0.7}
              />
            </mesh>
          );
        })}

        {/* Central glow effect */}
        <pointLight
          color={primaryColor}
          intensity={0.3}
          distance={enemySize * 2}
          decay={2}
        />
      </group>
    );
  }
);

UpgradeEffect.displayName = "UpgradeEffect";

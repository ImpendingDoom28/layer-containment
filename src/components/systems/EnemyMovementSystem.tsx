import { FC } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { runEnemyMovementFrame } from "../../core/ecs/systems/enemyMovementSystem";
import type { GetSimulationTime } from "../../core/hooks/useSimulationClock";
import { useSettingsStore } from "../../core/stores/useSettingsStore";
import { clampFrameDelta } from "../../utils/gameDelta";

type EnemyMovementSystemProps = {
  shouldStopMovement: boolean;
  getSimulationTime: GetSimulationTime;
  onEnemyReachEnd: ((enemyId: number) => void) | null;
  onEndEffect:
    ((position: [number, number, number], color: string) => void) | null;
};

/**
 * Batched enemy movement: one system advances all enemies per frame and
 * writes only the hot EnemyMotion trait, so no React re-render is triggered
 * by per-frame motion.
 */
export const EnemyMovementSystem: FC<EnemyMovementSystemProps> = ({
  shouldStopMovement,
  getSimulationTime,
  onEnemyReachEnd,
  onEndEffect,
}) => {
  const world = useWorld();

  useFrame((state, delta) => {
    if (shouldStopMovement) return;

    const clampedDelta = clampFrameDelta(
      delta,
      useSettingsStore.getState().pauseWhenTabHidden
    );
    runEnemyMovementFrame(world, state, clampedDelta, getSimulationTime, {
      onEnemyReachEnd,
      onEndEffect,
    });
  });

  return null;
};

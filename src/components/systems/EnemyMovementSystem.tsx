import { FC } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { runEnemyMovementFrame } from "../../core/ecs/systems/enemyMovementSystem";
import type {
  GetSimulationTime,
  GetTimeScale,
} from "../../core/hooks/useSimulationClock";
import { useSettingsStore } from "../../core/stores/useSettingsStore";
import { clampFrameDelta } from "../../utils/gameDelta";

type EnemyMovementSystemProps = {
  shouldStopMovement: boolean;
  getSimulationTime: GetSimulationTime;
  getTimeScale: GetTimeScale;
  onEnemyReachEnd: ((enemyId: number) => void) | null;
  onEndEffect:
    ((position: [number, number, number], color: string) => void) | null;
};

/**
 * Batched enemy movement: one system advances all enemies per frame and
 * writes only the hot EnemyMotion trait, so no React re-render is triggered
 * by per-frame motion. The frame runs even while a pause is in effect —
 * the per-frame delta is scaled by the time-dilation scale so the world
 * eases to stillness instead of cutting, and end-of-path settlement is
 * deferred until movement is fully resumed.
 */
export const EnemyMovementSystem: FC<EnemyMovementSystemProps> = ({
  shouldStopMovement,
  getSimulationTime,
  getTimeScale,
  onEnemyReachEnd,
  onEndEffect,
}) => {
  const world = useWorld();

  useFrame((state, delta) => {
    const clampedDelta = clampFrameDelta(
      delta,
      useSettingsStore.getState().pauseWhenTabHidden
    );
    runEnemyMovementFrame(world, state, clampedDelta * getTimeScale(), getSimulationTime, {
      onEnemyReachEnd,
      onEndEffect,
      canFinish: !shouldStopMovement,
    });
  });

  return null;
};

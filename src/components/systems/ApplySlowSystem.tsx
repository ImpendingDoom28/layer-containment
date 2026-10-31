import { FC } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { useSimulationClock } from "../../core/contexts/SimulationClockContext";
import { runSlowSystem } from "../../core/ecs/systems/slowSystem";

/**
 * Consumes pending slow requests and expires active slows in the world.
 * Runs before the EnemyMovementSystem (priority -1) so the movement pass
 * reads the updated slow state.
 */
export const ApplySlowSystem: FC = () => {
  const world = useWorld();
  const { shouldStopMovement, getSimulationTime } = useSimulationClock();

  useFrame((state) => {
    if (shouldStopMovement) return;

    const effectiveTime = getSimulationTime(state.clock.elapsedTime);
    runSlowSystem(world, effectiveTime);
  }, -1);

  return null;
};

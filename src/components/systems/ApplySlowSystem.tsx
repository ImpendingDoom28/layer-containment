import { FC } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { runSlowSystem } from "../../core/ecs/systems/slowSystem";
import type { GetSimulationTime } from "../../core/hooks/useSimulationClock";

type ApplySlowSystemProps = {
  shouldStopMovement: boolean;
  getSimulationTime: GetSimulationTime;
};

/**
 * Consumes pending slow requests and expires active slows in the world.
 * Runs before the EnemyMovementSystem (priority -1) so the movement pass
 * reads the updated slow state.
 */
export const ApplySlowSystem: FC<ApplySlowSystemProps> = ({
  shouldStopMovement,
  getSimulationTime,
}) => {
  const world = useWorld();

  useFrame((state) => {
    if (shouldStopMovement) return;

    const effectiveTime = getSimulationTime(state.clock.elapsedTime);
    runSlowSystem(world, effectiveTime);
  }, -1);

  return null;
};

import { FC } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { useSimulationClock } from "../../core/contexts/SimulationClockContext";
import { runMedicHealPulseSystem } from "../../core/ecs/systems/medicHealPulseSystem";

export const MedicHealPulseSystem: FC = () => {
  const world = useWorld();
  const { shouldStopMovement, getSimulationTime } = useSimulationClock();

  useFrame((state) => {
    if (shouldStopMovement) return;

    const effectiveTime = getSimulationTime(state.clock.elapsedTime);
    runMedicHealPulseSystem(world, effectiveTime);
  }, -1);

  return null;
};

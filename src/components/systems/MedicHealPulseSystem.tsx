import { FC, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import {
  createPauseClock,
  getEffectiveGameTime,
  stepPauseClock,
} from "../../utils/pauseClock";
import { runMedicHealPulseSystem } from "../../core/ecs/systems/medicHealPulseSystem";

type MedicHealPulseSystemProps = {
  shouldStopMovement: boolean;
};

export const MedicHealPulseSystem: FC<MedicHealPulseSystemProps> = ({
  shouldStopMovement,
}) => {
  const world = useWorld();
  const pauseClockRef = useRef(createPauseClock());
  const previousShouldStopMovementRef = useRef(shouldStopMovement);
  const shouldStopRef = useRef(shouldStopMovement);

  shouldStopRef.current = shouldStopMovement;

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const isPaused = shouldStopRef.current;
    const wasPaused = previousShouldStopMovementRef.current;

    stepPauseClock(pauseClockRef.current, now, isPaused, wasPaused);
    previousShouldStopMovementRef.current = isPaused;

    if (isPaused) return;

    const effectiveTime = getEffectiveGameTime(now, pauseClockRef.current);
    runMedicHealPulseSystem(world, effectiveTime);
  }, -1);

  return null;
};

import type { FC } from "react";
import { useFrame } from "@react-three/fiber";

import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";
import { getTowerIdleRigs, updateTowerIdleRig } from "./towerIdleRig";

type TowerIdleAnimationProps = {
  /** Reports whether the sim's aim pass is driving a tower's turret yaw
   *  (the idle scan must leave the yaw alone while it is). */
  hasTowerTarget: (towerId: number) => boolean;
};

/**
 * The one shared frame loop for every placed tower's idle animation: a slow
 * scan rotation on each tower's top piece, a gentle bob, and a subtle
 * breathing of its emissive accents, each with a per-tower phase offset.
 * Towers register their rigs from `Tower` on model load; this driver just
 * iterates the registry, so a tower costs a few property writes per frame
 * instead of its own `useFrame` subscription. Everything runs on the
 * pause-aware simulation clock, so the motion freezes with the world on
 * pause (and eases with time dilation), and is skipped under
 * `prefers-reduced-motion`.
 */
export const TowerIdleAnimation: FC<TowerIdleAnimationProps> = ({
  hasTowerTarget,
}) => {
  const { getSimulationTime } = useSimulationClock();
  const reducedMotion = useReducedMotion();

  useFrame((state) => {
    const simTime = getSimulationTime(state.clock.elapsedTime);
    for (const rig of getTowerIdleRigs().values()) {
      updateTowerIdleRig(
        rig,
        simTime,
        hasTowerTarget(rig.towerId),
        reducedMotion
      );
    }
  });

  return null;
};

TowerIdleAnimation.displayName = "TowerIdleAnimation";

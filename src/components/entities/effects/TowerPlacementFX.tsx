import { FC, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";
import {
  createTowerPlacementRig,
  updateTowerPlacementRig,
} from "./towerPlacementRig";

type TowerPlacementFXProps = {
  /**
   * The drop group (the tower's inner model group, whose local +Y is the tile
   * surface normal). The component applies the drop to this object and owns it
   * until the drop settles.
   */
  dropGroup: Group;
  /** The drop height in local units (the tower base radius, so a wide tower drops from proportionally higher). */
  dropHeight: number;
  /** Called once the drop has fully settled (the tower is at rest). */
  onDone: () => void;
};

/**
 * Runs one tower's placement drop: the model falls from above (ease-in start,
 * accelerating into the ground) and lands with a hard push — a squash-and-
 * rebound settle on impact. It is a per-tower component mounted only for
 * freshly placed towers: the drop runs on the pause-aware simulation clock in
 * `useFrame` by mutation, and once it settles the component unmounts itself
 * (via `onDone`), returning the drop group to its rest pose so the idle
 * animation and frustum culling see a clean baseline.
 */
export const TowerPlacementFX: FC<TowerPlacementFXProps> = ({
  dropGroup,
  dropHeight,
  onDone,
}) => {
  const { getSimulationTime } = useSimulationClock();
  const reducedMotion = useReducedMotion();

  const rig = useMemo(
    () => createTowerPlacementRig(dropGroup, dropHeight),
    [dropGroup, dropHeight]
  );

  useFrame((state) => {
    const settled = updateTowerPlacementRig(
      rig,
      getSimulationTime(state.clock.elapsedTime),
      reducedMotion
    );
    if (settled) onDone();
  });

  return null;
};

TowerPlacementFX.displayName = "TowerPlacementFX";

import { FC, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { runStatsSystem } from "../../core/ecs/systems/statsSystem";
import {
  damageDealtRequest,
  moneyEarnedRequest,
  moneySpentRequest,
} from "../../core/ecs/traits/stats";

/**
 * Folds pending stats receipts into the run's stats entity once per frame.
 * Mirrors ApplyEffectSystem (per-frame consumption, straggler sweep on
 * unmount).
 */
export const ApplyStatsSystem: FC = () => {
  const world = useWorld();

  useFrame(() => {
    runStatsSystem(world);
  });

  // The world is shared across scenes, and this system's frame pass runs
  // before the systems that raise requests, so a request raised on the final
  // frame of a scene outlives the unmount. Sweep stragglers so the next
  // scene does not collect leftover receipts.
  useEffect(() => {
    return () => {
      for (const entity of world.query(damageDealtRequest)) {
        if (entity.isAlive()) entity.destroy();
      }
      for (const entity of world.query(moneyEarnedRequest)) {
        if (entity.isAlive()) entity.destroy();
      }
      for (const entity of world.query(moneySpentRequest)) {
        if (entity.isAlive()) entity.destroy();
      }
    };
  }, [world]);

  return null;
};

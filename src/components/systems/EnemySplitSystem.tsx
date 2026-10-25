import { FC, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { runEnemySplitSystem } from "../../core/ecs/systems/enemySplitSystem";
import { splitRequest } from "../../core/ecs/traits/split";
import { useEntityIds } from "../../core/contexts/EntityIdContext";

/**
 * Consumes the split requests raised by the EnemyDeathSystem and spawns the
 * death-children. Child ids must come from the shared `EntityIdContext`
 * counter (the same counter the wave/level systems draw from) so they never
 * collide with the live enemy registry — the core system has no access to
 * React context, so the id callback is injected here from the provider.
 *
 * Like the other apply systems, runs in the shared scene system (game + menu)
 * and sweeps stragglers on unmount.
 */
export const EnemySplitSystem: FC = () => {
  const world = useWorld();
  const { getNextEnemyId } = useEntityIds();

  useFrame(() => {
    runEnemySplitSystem(world, getNextEnemyId);
  });

  useEffect(() => {
    return () => {
      for (const entity of world.query(splitRequest)) {
        if (entity.isAlive()) entity.destroy();
      }
    };
  }, [world]);

  return null;
};

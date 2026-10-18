import { FC, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { runApplyEffectSystem } from "../../core/ecs/systems/applyEffectSystem";
import { spawnEffectRequest } from "../../core/ecs/traits/effect";

/**
 * Consumes pending spawn-effect requests and turns them into effect entities.
 * Runs every frame, mirroring ApplyDamageSystem.
 */
export const ApplyEffectSystem: FC = () => {
  const world = useWorld();

  useFrame(() => {
    runApplyEffectSystem(world);
  });

  // The world is shared across scenes, and this system's frame pass runs
  // before the systems that raise requests, so a request raised on the final
  // frame of a scene outlives the unmount. Sweep stragglers so the next
  // scene does not render a leftover burst.
  useEffect(() => {
    return () => {
      for (const entity of world.query(spawnEffectRequest)) {
        if (entity.isAlive()) entity.destroy();
      }
    };
  }, [world]);

  return null;
};

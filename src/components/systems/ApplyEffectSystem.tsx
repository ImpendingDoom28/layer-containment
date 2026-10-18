import { FC } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { runApplyEffectSystem } from "../../core/ecs/systems/applyEffectSystem";

/**
 * Consumes pending spawn-effect requests and turns them into effect entities.
 * Runs every frame, mirroring ApplyDamageSystem.
 */
export const ApplyEffectSystem: FC = () => {
  const world = useWorld();

  useFrame(() => {
    runApplyEffectSystem(world);
  });

  return null;
};

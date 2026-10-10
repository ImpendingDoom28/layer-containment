import { useWorld } from "koota/react";
import { useFrame } from "@react-three/fiber";
import { useCallback } from "react";

import { isBase, requestBaseDefeat } from "../../core/ecs/traits/base";
import { isDead } from "../../core/ecs/traits/health";

export const ApplyBaseDefeatSystem = () => {
  const world = useWorld();

  const runBaseDefeatSystem = useCallback(() => {
    const base = world.queryFirst(isBase, isDead);
    if (!base) return;

    base.add(requestBaseDefeat);
  }, [world]);

  useFrame(() => {
    runBaseDefeatSystem();
  });

  return null;
};

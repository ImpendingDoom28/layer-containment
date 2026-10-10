import { FC } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { runEnemyDeathSystem } from "../../core/ecs/systems/enemyDeathSystem";

export const EnemyDeathSystem: FC = () => {
  const world = useWorld();

  useFrame(() => {
    runEnemyDeathSystem(world);
  });

  return null;
};

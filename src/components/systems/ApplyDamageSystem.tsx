import { FC } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import { runDamageSystem } from "../../core/ecs/systems/damageSystem";

export const ApplyDamageSystem: FC = () => {
  const world = useWorld();

  useFrame(() => {
    runDamageSystem(world);
  });

  return null;
};

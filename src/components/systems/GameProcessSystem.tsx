import { useWorld } from "koota/react";
import { useFrame } from "@react-three/fiber";

import { runBaseDefeatSystem } from "../../core/ecs/systems/gameProcessSystem";

export const GameProcessSystem = () => {
  const world = useWorld();

  useFrame(() => {
    runBaseDefeatSystem(world);
  });

  return null;
};

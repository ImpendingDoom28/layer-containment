import { PerspectiveCamera } from "@react-three/drei";
import { useQueryFirst } from "koota/react";

import { isPlayer } from "../traits/player";
import { InputDirection } from "../traits/input";

export const EcsGameCamera = () => {
  const player = useQueryFirst(isPlayer, InputDirection);
  const inputDirection = player?.get(InputDirection);

  return <PerspectiveCamera makeDefault position={[0, 20, 15]} fov={40} />;
};

import { RootState, useFrame } from "@react-three/fiber";
import { moverActions } from "../actions/moverActions";
import { useActions } from "koota/react";
import { FC } from "react";

export const MoverSystem: FC = () => {
  const actions = useActions(moverActions);

  useFrame((state: RootState, delta: number) => {
    actions.moveEntities(state.clock.elapsedTime, delta);
  });

  return null;
};

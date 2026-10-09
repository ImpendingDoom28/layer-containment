import { useActions } from "koota/react";
import { healthActions } from "../actions/healthActions";
import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";

export const HealthSystem = () => {
  const actions = useActions(healthActions);

  useFrame(() => {
    actions.clearDeadEntities();
  });

  useEffect(() => {
    return () => {
      actions.clearDeadEntities();
    };
  }, [actions]);

  return null;
};

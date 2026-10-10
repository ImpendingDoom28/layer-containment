import { useQueryFirst, useTrait } from "koota/react";

import { isBase } from "../ecs/traits/base";
import { HealthInfo } from "../ecs/traits/health";

export const useBaseHealth = () => {
  const base = useQueryFirst(isBase);
  const healthInfo = useTrait(base, HealthInfo);

  return healthInfo?.currentHealth ?? 0;
};

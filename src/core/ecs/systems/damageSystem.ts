import type { World } from "koota";

import { damageRequest } from "../traits/damage";
import { HealthInfo, isDead } from "../traits/health";

export const runDamageSystem = (world: World): void => {
  const targets = world.query(HealthInfo, damageRequest);
  if (targets.length === 0) return;

  for (const entity of targets) {
    const request = entity.get(damageRequest);
    const health = entity.get(HealthInfo);
    if (request && health) {
      const newHealth = Math.max(0, health.currentHealth - request.amount);
      entity.set(HealthInfo, { ...health, currentHealth: newHealth });
      if (newHealth === 0) {
        entity.add(isDead);
      }
    }
    entity.remove(damageRequest);
  }
};

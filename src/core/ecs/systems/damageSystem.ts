import type { World } from "koota";

import { damageRequest } from "../traits/damage";
import { HealthInfo, isDead } from "../traits/health";
import { isBase } from "../traits/base";
import { GameEvent } from "../../types/enums/events";
import { gameEvents } from "../../../utils/eventEmitter";

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
      // The base is the only non-enemy damage target; report its hits so the
      // view layer can play the stronger, red-tinted camera punch (the event
      // carries the merged amount; the base has no Position trait, so the
      // punch falls back to the field center).
      if (entity.has(isBase)) {
        gameEvents.emit(GameEvent.BASE_DAMAGE_TAKEN, {
          amount: request.amount,
        });
      }
    }
    entity.remove(damageRequest);
  }
};

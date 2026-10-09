import { createActions, Entity } from "koota";
import { HealthInfo, isDead } from "../traits/health";

export type HealthActions = {
  updateHealth: (entity: Entity, amount: number) => void;
  clearDeadEntities: () => void;
};

export const healthActions = createActions<HealthActions>((world) => ({
  updateHealth: (entity: Entity, amount: number) => {
    const entityHealthInfo = entity.get(HealthInfo);
    if (!entityHealthInfo) return;

    entityHealthInfo.currentHealth = Math.min(
      Math.max(amount, 0),
      entityHealthInfo.maxHealth
    );
    if (entityHealthInfo.currentHealth === 0) {
      entity.add(isDead);
    }

    entity.set(HealthInfo, entityHealthInfo);
  },
  clearDeadEntities: () => {
    world.query(isDead).forEach((entity) => {
      entity.destroy();
    });
  },
}));

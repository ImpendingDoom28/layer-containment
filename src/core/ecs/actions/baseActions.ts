import { createActions } from "koota";

import { isBase } from "../traits/base";
import { HealthInfo, isDead } from "../traits/health";

export const worldBaseActions = createActions((world) => ({
  spawnBase: (maxHealth: number) => {
    const existingBase = world.queryFirst(isBase);
    if (existingBase) {
      existingBase.destroy();
    }
    world.spawn(isBase, HealthInfo({ currentHealth: maxHealth, maxHealth }));
  },

  damageBase: (amount: number) => {
    const base = world.queryFirst(isBase);
    if (!base) {
      return;
    }
    const health = base.get(HealthInfo);
    if (!health) {
      return;
    }
    const newHealth = Math.max(0, health.currentHealth - amount);
    base.set(HealthInfo, { ...health, currentHealth: newHealth });
    if (newHealth === 0) {
      base.add(isDead);
    }
  },

  removeBase: () => {
    const base = world.queryFirst(isBase);
    if (base) {
      base.destroy();
    }
  },
}));

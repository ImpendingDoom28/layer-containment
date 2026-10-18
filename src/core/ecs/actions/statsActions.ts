import { createActions } from "koota";

import type { TowerType } from "../../types/game";
import {
  DamageByTowerType,
  KillsByTowerType,
  IsStats,
  MoneyEarned,
  SpendByTowerType,
  damageDealtRequest,
  moneyEarnedRequest,
  moneySpentRequest,
} from "../traits/stats";

/**
 * Owns the per-run stats entity: spawns a fresh one on run start and
 * destroys it (with any still-pending receipts) on run end.
 */
export const statsActions = createActions((world) => ({
  startRunStats: (): void => {
    const existing = world.queryFirst(IsStats);
    if (existing) {
      existing.destroy();
    }
    world.spawn(
      IsStats,
      DamageByTowerType(),
      SpendByTowerType(),
      MoneyEarned({ total: 0 }),
      KillsByTowerType()
    );
  },

  endRunStats: (): void => {
    // Destroy the stats entity plus any still-pending receipts so they do
    // not leak into the next run.
    for (const entity of world.query(IsStats)) {
      entity.destroy();
    }
    for (const entity of world.query(damageDealtRequest)) {
      entity.destroy();
    }
    for (const entity of world.query(moneyEarnedRequest)) {
      entity.destroy();
    }
    for (const entity of world.query(moneySpentRequest)) {
      entity.destroy();
    }
  },

  /** Raises a purchase receipt; a no-op when no run is being tracked. */
  recordTowerPurchase: (towerType: TowerType, amount: number): void => {
    if (!world.queryFirst(IsStats)) return;
    world.spawn(moneySpentRequest({ towerType, amount }));
  },
}));

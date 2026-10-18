import type { World } from "koota";

import type { EnemyType, TowerType } from "../../types/game";
import {
  DamageByTowerType,
  KillsByTowerType,
  IsStats,
  MoneyEarned,
  SpendByTowerType,
} from "../traits/stats";

export type RunStatsSnapshot = {
  totalEarned: number;
  damageByTowerType: Partial<Record<TowerType, number>>;
  spendByTowerType: Partial<Record<TowerType, number>>;
  killsByTowerType: Partial<Record<TowerType, Partial<Record<EnemyType, number>>>>;
};

const createEmptyRunStats = (): RunStatsSnapshot => ({
  totalEarned: 0,
  damageByTowerType: {},
  spendByTowerType: {},
  killsByTowerType: {},
});

/**
 * Pure snapshot of the current run's stats for the view layer. Returns an
 * empty snapshot (not `undefined`) when no run is active, so the UI can
 * treat it uniformly.
 */
export const getRunStats = (world: World): RunStatsSnapshot => {
  const statsEntity = world.queryFirst(IsStats);
  if (!statsEntity) return createEmptyRunStats();

  const earned = statsEntity.get(MoneyEarned);
  const damage = statsEntity.get(DamageByTowerType);
  const spend = statsEntity.get(SpendByTowerType);
  const kills = statsEntity.get(KillsByTowerType);

  return {
    totalEarned: earned?.total ?? 0,
    damageByTowerType: { ...damage },
    spendByTowerType: { ...spend },
    killsByTowerType: Object.fromEntries(
      Object.entries(kills).map(([tower, byEnemy]) => [
        tower,
        { ...byEnemy },
      ])
    ) as RunStatsSnapshot["killsByTowerType"],
  };
};

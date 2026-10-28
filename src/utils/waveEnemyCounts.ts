import type {
  EnemyUpgradeConfig,
  EnemyUpgradeId,
  WaveEnemyGroup,
} from "../core/types/game";
import {
  countUpgradePicks,
  getTieredUpgradeEffect,
} from "./enemyUpgradeTierEffects";

export const getWaveCountMultiplierForStack = (
  stack: readonly EnemyUpgradeId[],
  enemyUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> | null | undefined
): number => {
  if (!enemyUpgrades) return 1;
  const id = "reinforcements" as const;
  const tier = countUpgradePicks(stack, id);
  if (tier === 0) return 1;
  const config = enemyUpgrades[id];
  if (!config) return 1;
  return (
    getTieredUpgradeEffect(config, Math.min(tier, 3) as 1 | 2 | 3)
      .countMultiplier ?? 1
  );
};

/**
 * Scales every group's `count` by the Reinforcements multiplier, rounded up.
 * The multiplier is identical for all groups, so the relative enemy mix is
 * preserved and the spawn cap stays meaningful. Always returns fresh group
 * objects: the caller mutates `count` while draining the queue.
 */
export const applyWaveEnemyCountMultiplier = (
  groups: WaveEnemyGroup[],
  multiplier: number
): WaveEnemyGroup[] =>
  groups.map((group) => ({
    ...group,
    count: Math.ceil(group.count * multiplier),
  }));

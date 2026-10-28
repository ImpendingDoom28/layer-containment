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
/**
 * Scales every group's `count` by the Reinforcements multiplier, rounded up.
 * The multiplier is identical for all groups, so the relative enemy mix is
 * preserved. Always returns fresh group objects: the caller mutates `count`
 * while draining the queue.
 */
export const applyWaveEnemyCountMultiplier = (
  groups: WaveEnemyGroup[],
  multiplier: number
): WaveEnemyGroup[] =>
  groups.map((group) => ({
    ...group,
    count: Math.ceil(group.count * multiplier),
  }));

/**
 * Reinforcements scales the per-group counts, but a wave is also bounded by a
 * spawn cap (`WaveConfig.totalEnemies`): the spawn loop only keeps the first
 * `cap` enemies of the queue. Because Reinforcements is a risk/reward upgrade,
 * its cap should scale with the same count multiplier — otherwise a cap-bound
 * wave (group counts already equal to `totalEnemies`) would not grow at all,
 * and the next-wave preview would show more enemies than actually spawn.
 *
 * Returns the (capped) groups and the total enemy count for a wave, given the
 * chosen enemy-upgrade stack. The spawn loop and the next-wave preview both
 * call this, so what the player is shown is what actually spawns.
 */
export const applyEnemyUpgradeCounts = (
  groups: WaveEnemyGroup[],
  stack: readonly EnemyUpgradeId[],
  enemyUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> | null | undefined,
  cap: number
): { groups: WaveEnemyGroup[]; total: number } => {
  const m = getWaveCountMultiplierForStack(stack, enemyUpgrades);
  const effectiveCap = m === 1 ? cap : Math.ceil(cap * m);
  let remaining = effectiveCap;
  const out: WaveEnemyGroup[] = [];
  let total = 0;
  for (const g of applyWaveEnemyCountMultiplier(groups, m)) {
    if (remaining <= 0) break;
    const c = Math.min(g.count, remaining);
    if (c <= 0) break;
    out.push({ ...g, count: c });
    total += c;
    remaining -= c;
  }
  return { groups: out, total };
};

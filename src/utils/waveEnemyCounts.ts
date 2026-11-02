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

export type WaveSpawnQueueItem = {
  type: WaveEnemyGroup["type"];
  delay: number;
  /** Portal (path index) the enemy emerges from; omitted for levels with a single path. */
  pathIndex?: number;
};

/**
 * Expands enemy groups into the full spawn queue: exactly `sum(groups.count)`
 * enemies, each picking its group with weight = remaining count, and each
 * adding the picked group's `spawnInterval` (ms) to the previous enemy's
 * delay. The input groups are not mutated.
 *
 * `pathCount` is the number of portals the level has. A group that names a
 * `pathIndex` spawns its enemies only from that portal; a group without one
 * has its enemies distributed evenly across all portals (the remainder goes
 * to the earlier portals, so every portal still gets its fair share). The
 * returned items carry the resolved `pathIndex`, so the preview and the spawn
 * loop always agree on which portal throws which enemy. With a single portal
 * (the common case) the item carries no `pathIndex`, matching the legacy
 * shape.
 */
export const buildWaveSpawnQueue = (
  groups: WaveEnemyGroup[],
  pathCount = 1,
  random: () => number = Math.random
): WaveSpawnQueueItem[] => {
  const remaining = groups.map((group) => ({ ...group }));
  const totalCount = remaining.reduce((sum, group) => sum + group.count, 0);
  let remainingCount = totalCount;

  // Unassigned groups are split evenly across the portals: the k-th enemy
  // emitted from a group takes portal `k % pathCount`, so every portal gets
  // floor/ceil(count / pathCount) of that group no matter when its enemies
  // are drawn. This matches the next-wave preview, which computes the same
  // per-portal shares per group.
  const emittedPerGroup = groups.map(() => 0);

  const selectWeightedIndex = (): number | null => {
    if (remainingCount === 0) return null;
    const roll = random() * remainingCount;
    let cumulativeWeight = 0;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].count <= 0) continue;
      cumulativeWeight += remaining[i].count;
      if (roll < cumulativeWeight) return i;
    }
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (remaining[i].count > 0) return i;
    }
    return null;
  };

  const queue: WaveSpawnQueueItem[] = [];
  let cumulativeDelay = 0;
  for (let i = 0; i < totalCount; i++) {
    const chosenIndex = selectWeightedIndex();
    if (chosenIndex === null) break;
    const chosen = remaining[chosenIndex];
    const emitted = emittedPerGroup[chosenIndex]++;
    const pathIndex =
      chosen.pathIndex !== undefined
        ? chosen.pathIndex
        : pathCount > 1
          ? emitted % pathCount
          : undefined;
    queue.push({ type: chosen.type, delay: cumulativeDelay, pathIndex });
    cumulativeDelay += chosen.spawnInterval * 1000;
    chosen.count -= 1;
    remainingCount -= 1;
  }
  return queue;
};

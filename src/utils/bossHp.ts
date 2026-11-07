import type {
  BossConfig,
  EnemyUpgradeConfig,
  EnemyUpgradeId,
} from "../core/types/game";
import {
  getStackTierForEnemy,
  getTieredUpgradeEffect,
  getUniqueUpgradeIdsInStackOrder,
} from "./enemyUpgradeTierEffects";

/**
 * Whether a given (1-based) wave number is one of the level's boss waves —
 * i.e. `everyNthWave`-th wave (4, 8, 12, …). Levels without a boss never are.
 */
export const isBossWave = (
  boss: BossConfig | null | undefined,
  waveNumber: number
): boolean => !!boss && waveNumber > 0 && waveNumber % boss.everyNthWave === 0;

/**
 * The boss's base HP for a given boss wave. Each appearance is stronger: the
 * first uses the raw base HP, and each later one is multiplied by
 * `hpGrowthPerAppearance` per prior appearance. Non-boss waves (or a level
 * with no boss) return 0.
 */
export const bossHealthForWave = (
  boss: BossConfig | null | undefined,
  waveNumber: number
): number => {
  if (!boss || !isBossWave(boss, waveNumber)) return 0;
  const appearance = waveNumber / boss.everyNthWave;
  const hpScale = (boss.hpGrowthPerAppearance ?? 1) ** (appearance - 1);
  return Math.round(boss.baseStats.health * hpScale);
};

/**
 * The boss HP a player actually sees in the next-wave preview, i.e.
 * `bossHealthForWave` with the currently selected enemy upgrades applied — the
 * boss is spawned with the wave's upgrade stack (`spawnLevelEnemy` multiplies
 * its base health by each upgrade's `healthMultiplier` in stack order), so the
 * preview shows the same number. An empty stack returns the bare
 * `bossHealthForWave`.
 */
export const bossHealthWithUpgrades = (
  boss: BossConfig | null | undefined,
  waveNumber: number,
  upgradeStack: readonly EnemyUpgradeId[] = [],
  enemyUpgrades?: Record<EnemyUpgradeId, EnemyUpgradeConfig> | null
): number => {
  const baseHealth = bossHealthForWave(boss, waveNumber);
  if (baseHealth === 0) return 0;
  let health = baseHealth;
  if (enemyUpgrades) {
    for (const upgradeId of getUniqueUpgradeIdsInStackOrder(upgradeStack)) {
      const upgrade = enemyUpgrades[upgradeId];
      if (!upgrade) continue;
      const stackTier = getStackTierForEnemy(upgradeId, upgradeStack);
      const effect = getTieredUpgradeEffect(upgrade, stackTier);
      if (effect.healthMultiplier) {
        health = Math.round(health * effect.healthMultiplier);
      }
    }
  }
  return health;
};

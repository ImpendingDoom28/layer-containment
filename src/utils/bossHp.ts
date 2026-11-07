import type { BossConfig } from "../core/types/game";

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
  if (!isBossWave(boss, waveNumber)) return 0;
  const appearance = waveNumber / boss.everyNthWave;
  const hpScale = (boss.hpGrowthPerAppearance ?? 1) ** (appearance - 1);
  return Math.round(boss.baseStats.health * hpScale);
};

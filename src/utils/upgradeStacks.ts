import type { EnemyUpgradeId, EnemyUpgradeStackTier } from "../core/types/game";

import { countUpgradePicks } from "./enemyUpgradeTierEffects";

/**
 * One visual cluster per upgrade the enemy carries: the upgrade id plus how
 * many times it was picked (1-3), which is the glyph count the enemy shows.
 */
export type UpgradeStack = {
  id: EnemyUpgradeId;
  tier: EnemyUpgradeStackTier;
};

/**
 * Derives the per-upgrade pick stacks from the full pick stack, preserving
 * first-pick order. `tier` is the number of times the upgrade was picked
 * (capped at 3), so the tier-1 visual is exactly one glyph and each further
 * pick adds one more.
 */
export const getUpgradeStacks = (
  stack: readonly EnemyUpgradeId[]
): UpgradeStack[] => {
  const seen: EnemyUpgradeId[] = [];
  const result: UpgradeStack[] = [];
  for (const id of stack) {
    if (seen.includes(id)) continue;
    seen.push(id);
    const count = countUpgradePicks(stack, id);
    result.push({ id, tier: Math.min(count, 3) as EnemyUpgradeStackTier });
  }
  return result;
};

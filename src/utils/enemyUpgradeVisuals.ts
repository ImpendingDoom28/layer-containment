import type { EnemyUpgradeConfig, EnemyUpgradeId } from "../core/types/game";

import {
  getStackTierForEnemy,
  getUniqueUpgradeIdsInStackOrder,
} from "./enemyUpgradeTierEffects";

const DEFAULT_INDICATOR_COLOR = "#ffffff";

export const getUpgradeIndicatorColors = (
  stack: readonly EnemyUpgradeId[],
  enemyUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> | null | undefined,
  fallbackColor: string = DEFAULT_INDICATOR_COLOR
): string[] => {
  if (stack.length === 0 || !enemyUpgrades) return [];
  const colors: string[] = [];
  for (const id of getUniqueUpgradeIdsInStackOrder(stack)) {
    const tier = getStackTierForEnemy(id, stack);
    const c = enemyUpgrades[id]?.indicatorColor ?? fallbackColor;
    for (let i = 0; i < tier; i++) {
      colors.push(c);
    }
  }
  return colors;
};

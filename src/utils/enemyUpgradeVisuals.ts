import type { EnemyUpgradeConfig, EnemyUpgradeId } from "../core/types/game";

const DEFAULT_INDICATOR_COLOR = "#ffffff";

export const getUpgradeIndicatorColors = (
  upgradeIds: EnemyUpgradeId[],
  enemyUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> | null | undefined,
  fallbackColor: string = DEFAULT_INDICATOR_COLOR
): string[] =>
  upgradeIds.map(
    (id) => enemyUpgrades?.[id]?.indicatorColor ?? fallbackColor
  );

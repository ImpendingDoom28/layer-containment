import type { World } from "koota";

import { getPositionAlongMultiplePaths } from "../../utils/pathUtils";
import { getUpgradeStacks } from "../../utils/upgradeStacks";
import {
  getStackTierForEnemy,
  getTieredUpgradeEffect,
  getTotalRewardMultiplierFromStack,
  getUniqueUpgradeIdsInStackOrder,
} from "../../utils/enemyUpgradeTierEffects";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import type { Enemy, EnemyType, EnemyUpgradeId } from "../types/game";
import { enemyActions } from "./actions/enemyActions";

export const spawnLevelEnemy = (
  world: World,
  getNextEnemyId: () => number,
  enemyType: EnemyType,
  applyUpgrades: EnemyUpgradeId[] = [],
  forcedPathIndex?: number
): Enemy | null => {
  const { enemyTypes, enemyUpgrades } = useGameStore.getState();
  const { pathWaypoints } = useLevelStore.getState();
  const enemyConfig = enemyTypes?.[enemyType];
  if (!enemyConfig || pathWaypoints.length === 0) return null;

  const pathIndex =
    forcedPathIndex !== undefined &&
    forcedPathIndex >= 0 &&
    forcedPathIndex < pathWaypoints.length
      ? forcedPathIndex
      : Math.floor(Math.random() * pathWaypoints.length);
  const startPosition = getPositionAlongMultiplePaths(
    pathWaypoints,
    pathIndex,
    0
  );

  let health = enemyConfig.health;
  let speed = enemyConfig.speed;
  let regeneration: number | undefined;
  let slowResistance: number | undefined;
  let dodgeChance: number | undefined;

  const reward = Math.round(
    enemyConfig.reward *
      getTotalRewardMultiplierFromStack(applyUpgrades, enemyUpgrades)
  );

  const uniqueUpgradeIds = getUniqueUpgradeIdsInStackOrder(applyUpgrades);
  for (const upgradeId of uniqueUpgradeIds) {
    const upgrade = enemyUpgrades?.[upgradeId];
    if (!upgrade) continue;

    const stackTier = getStackTierForEnemy(upgradeId, applyUpgrades);
    const effect = getTieredUpgradeEffect(upgrade, stackTier);

    if (effect.healthMultiplier) {
      health = Math.round(health * effect.healthMultiplier);
    }
    if (effect.speedMultiplier) {
      speed *= effect.speedMultiplier;
    }
    if (effect.regeneration) {
      regeneration = (regeneration ?? 0) + effect.regeneration;
    }
    if (effect.slowResistance !== undefined) {
      slowResistance = Math.max(slowResistance ?? 0, effect.slowResistance);
    }
    if (effect.dodgeChance !== undefined) {
      dodgeChance = Math.max(dodgeChance ?? 0, effect.dodgeChance);
    }
  }

  const enemy: Enemy = {
    ...enemyConfig,
    id: getNextEnemyId(),
    type: enemyType,
    health,
    maxHealth: health,
    speed,
    reward,
    pathProgress: 0,
    pathIndex,
    x: startPosition.x,
    z: startPosition.z,
    upgrades: uniqueUpgradeIds,
    upgradeStacks: getUpgradeStacks(applyUpgrades),
    regeneration,
    slowResistance,
    dodgeChance,
  };

  enemyActions(world).spawnEnemy(enemy);
  return enemy;
};

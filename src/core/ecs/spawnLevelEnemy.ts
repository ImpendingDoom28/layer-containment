import type { World } from "koota";

import { getPositionAlongMultiplePaths } from "../../utils/pathUtils";
import { getUpgradeStacks } from "../../utils/upgradeStacks";
import {
  getStackTierForEnemy,
  getTieredUpgradeEffect,
  getTotalRewardMultiplierFromStack,
  getUniqueUpgradeIdsInStackOrder,
} from "../../utils/enemyUpgradeTierEffects";
import { useAlmanacStore } from "../stores/useAlmanacStore";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import type {
  Enemy,
  EnemyConfig,
  EnemyType,
  EnemyUpgradeId,
} from "../types/game";
import { enemyActions } from "./actions/enemyActions";
import { IsBoss } from "./traits/enemy";

/**
 * Base-stat overrides for a spawn. Lets a caller (the boss) keep an enemy
 * type's model/behavior but start from its own base stats — the upgrade stack
 * is still applied additively on top, exactly like a regular enemy.
 */
export type SpawnLevelEnemyOverrides = Partial<
  Pick<
    EnemyConfig,
    "health" | "speed" | "size" | "healthLoss" | "reward" | "name" | "color"
  >
> & {
  /** Tags the spawned entity with `IsBoss` (the HUD boss bar watches for it). */
  isBoss?: boolean;
};

export const spawnLevelEnemy = (
  world: World,
  getNextEnemyId: () => number,
  enemyType: EnemyType,
  applyUpgrades: EnemyUpgradeId[] = [],
  forcedPathIndex?: number,
  overrides?: SpawnLevelEnemyOverrides
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

  // Base stats: the enemy type's, overridden by `overrides` (the boss keeps an
  // enemy type's model/behavior but starts from its own base stats). The
  // upgrade stack below is applied additively on top, exactly like a regular
  // enemy of that wave.
  const baseHealth = overrides?.health ?? enemyConfig.health;
  const baseSpeed = overrides?.speed ?? enemyConfig.speed;
  const baseReward = overrides?.reward ?? enemyConfig.reward;
  const baseSize = overrides?.size ?? enemyConfig.size;
  const baseHealthLoss = overrides?.healthLoss ?? enemyConfig.healthLoss;

  let health = baseHealth;
  let speed = baseSpeed;
  let regeneration: number | undefined;
  let slowResistance: number | undefined;
  let dodgeChance: number | undefined;

  const reward = Math.round(
    baseReward * getTotalRewardMultiplierFromStack(applyUpgrades, enemyUpgrades)
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
    name: overrides?.name ?? enemyConfig.name,
    color: overrides?.color ?? enemyConfig.color,
    health,
    maxHealth: health,
    speed,
    reward,
    size: baseSize,
    healthLoss: baseHealthLoss,
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

  const entity = enemyActions(world).spawnEnemy(enemy);
  if (overrides?.isBoss) {
    entity.add(IsBoss);
    useAlmanacStore.getState().discoverBoss(enemy.name);
  }
  return enemy;
};

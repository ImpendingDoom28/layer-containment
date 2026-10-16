import type {
  EnemyUpgradeConfig,
  EnemyUpgradeId,
  EnemyUpgradeStackTier,
} from "../core/types/game";

export type TieredUpgradeEffect = {
  rewardMultiplier: number;
  healthMultiplier?: number;
  speedMultiplier?: number;
  regeneration?: number;
  slowResistance?: number;
};

export const countUpgradePicks = (
  stack: readonly EnemyUpgradeId[],
  upgradeId: EnemyUpgradeId
): number => stack.filter((id) => id === upgradeId).length;

export const getStackTierForEnemy = (
  upgradeId: EnemyUpgradeId,
  stack: readonly EnemyUpgradeId[]
): EnemyUpgradeStackTier => {
  const n = countUpgradePicks(stack, upgradeId);
  return Math.min(n, 3) as EnemyUpgradeStackTier;
};

export const getPickTierForUpgrade = (
  stack: readonly EnemyUpgradeId[],
  upgradeId: EnemyUpgradeId
): EnemyUpgradeStackTier => {
  const n = countUpgradePicks(stack, upgradeId);
  return Math.min(n + 1, 3) as EnemyUpgradeStackTier;
};

export const getPickTierForStackEntryIndex = (
  stack: readonly EnemyUpgradeId[],
  index: number
): EnemyUpgradeStackTier => {
  const id = stack[index];
  return (countUpgradePicks(stack.slice(0, index), id) +
    1) as EnemyUpgradeStackTier;
};

export const getTieredUpgradeEffect = (
  config: EnemyUpgradeConfig,
  tier: EnemyUpgradeStackTier
): TieredUpgradeEffect => {
  const h1 = config.healthMultiplier ?? 1;
  const s1 = config.speedMultiplier ?? 1;
  const r1 = config.rewardMultiplier;
  const regen1 = config.abilities?.regeneration ?? 0;
  const slow1 = config.resistances?.slow ?? 0;

  switch (config.id) {
    case "armored": {
      const health =
        tier === 1
          ? h1
          : tier === 2
            ? 1 + (h1 - 1) * 1.15
            : 1 + (h1 - 1) * 1.33;
      const reward = tier === 1 ? r1 : tier === 2 ? r1 * 1.1 : r1 * 1.25;
      return { healthMultiplier: health, rewardMultiplier: reward };
    }
    case "swift": {
      const speed =
        tier === 1 ? s1 : tier === 2 ? 1 + (s1 - 1) * 1.2 : 1 + (s1 - 1) * 1.45;
      const reward = tier === 1 ? r1 : tier === 2 ? r1 * 1.08 : r1 * 1.2;
      return { speedMultiplier: speed, rewardMultiplier: reward };
    }
    case "slowResistance": {
      // Tiers 1-2 scale the base slow resistance (capped); tier 3 grants
      // full immunity no matter what base value the config carries.
      const resistance =
        tier === 3 ? 1 : tier === 2 ? Math.min(slow1 * 2.64, 1) : slow1;
      return {
        rewardMultiplier: tier === 1 ? r1 : tier === 2 ? r1 * 1.1 : r1 * 1.22,
        slowResistance: resistance,
      };
    }
    case "regenerating": {
      const regen =
        tier === 1 ? regen1 : tier === 2 ? regen1 * 1.5 : regen1 * 2.25;
      const reward = tier === 1 ? r1 : tier === 2 ? r1 * 1.1 : r1 * 1.24;
      return {
        regeneration: regen,
        rewardMultiplier: reward,
      };
    }
  }
};

export const getTierRewardBonusPercent = (
  config: EnemyUpgradeConfig,
  tier: EnemyUpgradeStackTier
): number => {
  return Math.round(
    (getTieredUpgradeEffect(config, tier).rewardMultiplier - 1) * 100
  );
};

export const formatTieredUpgradeSummary = (
  config: EnemyUpgradeConfig,
  tier: EnemyUpgradeStackTier
): string => {
  const e = getTieredUpgradeEffect(config, tier);
  const parts: string[] = [];
  if (e.healthMultiplier !== undefined && e.healthMultiplier !== 1) {
    parts.push(`+${Math.round((e.healthMultiplier - 1) * 100)}% HP`);
  }
  if (e.speedMultiplier !== undefined && e.speedMultiplier !== 1) {
    parts.push(`+${Math.round((e.speedMultiplier - 1) * 100)}% speed`);
  }
  if (e.regeneration !== undefined && e.regeneration > 0) {
    parts.push(`${e.regeneration.toFixed(1)} HP/s regen`);
  }
  if (e.slowResistance !== undefined && e.slowResistance >= 1) {
    parts.push("Slow immune");
  } else if (e.slowResistance !== undefined && e.slowResistance > 0) {
    parts.push(`+${Math.round(e.slowResistance * 100)}% slow resistance`);
  }
  return parts.join(" · ");
};

export const getTotalRewardMultiplierFromStack = (
  stack: readonly EnemyUpgradeId[],
  enemyUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> | null | undefined
): number => {
  if (!enemyUpgrades) return 1;
  let acc = 1;
  for (let i = 0; i < stack.length; i++) {
    const id = stack[i];
    const pickTier = (countUpgradePicks(stack.slice(0, i), id) +
      1) as EnemyUpgradeStackTier;
    const config = enemyUpgrades[id];
    if (!config) continue;
    acc *= getTieredUpgradeEffect(config, pickTier).rewardMultiplier;
  }
  return acc;
};

export const getUniqueUpgradeIdsInStackOrder = (
  stack: readonly EnemyUpgradeId[]
): EnemyUpgradeId[] => {
  const order: EnemyUpgradeId[] = [];
  for (const id of stack) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
};

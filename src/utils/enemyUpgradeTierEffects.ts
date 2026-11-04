import { i18n } from "../core/i18n/i18n";
import type {
  EnemyUpgradeConfig,
  EnemyUpgradeId,
  EnemyUpgradeStackTier,
} from "../core/types/game";

export type TieredUpgradeEffect = {
  rewardMultiplier: number;
  healthMultiplier?: number;
  speedMultiplier?: number;
  countMultiplier?: number;
  regeneration?: number;
  slowResistance?: number;
  dodgeChance?: number;
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

export const getTierRoman = (tier: EnemyUpgradeStackTier): string => {
  switch (tier) {
    case 1:
      return "I";
    case 2:
      return "II";
    case 3:
      return "III";
  }
};

export const getPickTierForUpgrade = (
  stack: readonly EnemyUpgradeId[],
  upgradeId: EnemyUpgradeId
): EnemyUpgradeStackTier => {
  const n = countUpgradePicks(stack, upgradeId);
  return Math.min(n + 1, 3) as EnemyUpgradeStackTier;
};

/**
 * Reads the absolute effect of one tier straight from the config. Each tier
 * in `public/configs/game.json` is a complete value (tier II fully replaces
 * tier I, it never stacks on top of it), so there is no scaling to do here.
 */
export const getTieredUpgradeEffect = (
  config: EnemyUpgradeConfig,
  tier: EnemyUpgradeStackTier
): TieredUpgradeEffect => {
  const t = config.tiers[tier - 1];
  const countMultiplier =
    t.countGrowth !== undefined ? 1 + t.countGrowth : undefined;
  return {
    rewardMultiplier: t.rewardMultiplier ?? 1,
    ...(t.healthMultiplier !== undefined &&
      t.healthMultiplier !== 1 && { healthMultiplier: t.healthMultiplier }),
    ...(t.speedMultiplier !== undefined &&
      t.speedMultiplier !== 1 && { speedMultiplier: t.speedMultiplier }),
    ...(countMultiplier !== undefined && countMultiplier !== 1 && { countMultiplier }),
    ...(t.regeneration !== undefined &&
      t.regeneration > 0 && { regeneration: t.regeneration }),
    ...(t.slowResistance !== undefined &&
      t.slowResistance > 0 && { slowResistance: t.slowResistance }),
    ...(t.dodgeChance !== undefined &&
      t.dodgeChance > 0 && { dodgeChance: t.dodgeChance }),
  };
};

export const getTierRewardBonusPercent = (
  config: EnemyUpgradeConfig,
  tier: EnemyUpgradeStackTier
): number => {
  return Math.round(
    (getTieredUpgradeEffect(config, tier).rewardMultiplier - 1) * 100
  );
};

/**
 * Formats a reward-bonus percentage with an explicit sign: "+10" for a
 * positive bonus and "-50" for a negative one (the i18n strings carry no
 * literal "+", now that several upgrades pay negative gold).
 */
export const formatSignedPercent = (value: number): string =>
  value > 0 ? `+${value}` : `${value}`;

export const formatTieredUpgradeSummary = (
  config: EnemyUpgradeConfig,
  tier: EnemyUpgradeStackTier
): string => {
  const e = getTieredUpgradeEffect(config, tier);
  const parts: string[] = [];
  if (e.healthMultiplier !== undefined && e.healthMultiplier !== 1) {
    parts.push(
      i18n.t("upgrade.hp", { percent: Math.round((e.healthMultiplier - 1) * 100) })
    );
  }
  if (e.speedMultiplier !== undefined && e.speedMultiplier !== 1) {
    parts.push(
      i18n.t("upgrade.speed", {
        percent: Math.round((e.speedMultiplier - 1) * 100),
      })
    );
  }
  if (e.countMultiplier !== undefined && e.countMultiplier !== 1) {
    parts.push(
      i18n.t("upgrade.count", {
        percent: Math.round((e.countMultiplier - 1) * 100),
      })
    );
  }
  if (e.regeneration !== undefined && e.regeneration > 0) {
    parts.push(i18n.t("upgrade.regen", { amount: e.regeneration.toFixed(1) }));
  }
  if (e.slowResistance !== undefined && e.slowResistance >= 1) {
    parts.push(i18n.t("upgrade.slowImmune"));
  } else if (e.slowResistance !== undefined && e.slowResistance > 0) {
    parts.push(
      i18n.t("upgrade.slowResistance", {
        percent: Math.round(e.slowResistance * 100),
      })
    );
  }
  if (e.dodgeChance !== undefined && e.dodgeChance > 0) {
    parts.push(
      i18n.t("upgrade.dodge", { percent: Math.round(e.dodgeChance * 100) })
    );
  }
  return parts.join(" · ");
};

export type UpgradeTotalEffect = {
  rewardMultiplier: number;
  healthMultiplier?: number;
  speedMultiplier?: number;
  countMultiplier?: number;
  regeneration?: number;
  slowResistance?: number;
  dodgeChance?: number;
};

export const getTotalUpgradeEffectForStack = (
  config: EnemyUpgradeConfig,
  tier: EnemyUpgradeStackTier
): UpgradeTotalEffect => {
  // Mirrors how spawns apply the upgrade: HP/speed/regen/slow use the
  // top-tier effect value, while gold stacks multiplicatively per pick.
  const top = getTieredUpgradeEffect(config, tier);
  let reward = 1;
  for (let t = 1 as EnemyUpgradeStackTier; t <= tier; t++) {
    reward *= getTieredUpgradeEffect(config, t).rewardMultiplier;
  }
  return {
    rewardMultiplier: reward,
    ...(top.healthMultiplier !== undefined &&
      top.healthMultiplier !== 1 && { healthMultiplier: top.healthMultiplier }),
    ...(top.speedMultiplier !== undefined &&
      top.speedMultiplier !== 1 && { speedMultiplier: top.speedMultiplier }),
    ...(top.countMultiplier !== undefined &&
      top.countMultiplier !== 1 && { countMultiplier: top.countMultiplier }),
    ...(top.regeneration !== undefined &&
      top.regeneration > 0 && { regeneration: top.regeneration }),
    ...(top.slowResistance !== undefined &&
      top.slowResistance > 0 && { slowResistance: top.slowResistance }),
    ...(top.dodgeChance !== undefined &&
      top.dodgeChance > 0 && { dodgeChance: top.dodgeChance }),
  };
};

export const getTotalRewardBonusPercentForStack = (
  config: EnemyUpgradeConfig,
  tier: EnemyUpgradeStackTier
): number => {
  return Math.round(
    (getTotalUpgradeEffectForStack(config, tier).rewardMultiplier - 1) * 100
  );
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

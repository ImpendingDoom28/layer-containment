import { describe, expect, it } from "vitest";

import type { EnemyUpgradeConfig, EnemyUpgradeId } from "../core/types/game";

import {
  countUpgradePicks,
  formatTieredUpgradeSummary,
  getStackTierForEnemy,
  getTieredUpgradeEffect,
  getTierRewardBonusPercent,
  getTierRoman,
  getTotalRewardBonusPercentForStack,
  getTotalRewardMultiplierFromStack,
  getTotalUpgradeEffectForStack,
  getUniqueUpgradeIdsInStackOrder,
} from "./enemyUpgradeTierEffects";

// Configs mirror the per-tier values in public/configs/game.json: each tier
// is an absolute effect (tier II/III replace the previous tier, no stacking).
const armoredBase: EnemyUpgradeConfig = {
  id: "armored",
  name: "Armored",
  description: "",
  displayRank: 1,
  tiers: [
    { healthMultiplier: 1.5, rewardMultiplier: 1.1 },
    { healthMultiplier: 1.75, rewardMultiplier: 1.21 },
    { healthMultiplier: 2, rewardMultiplier: 1.375 },
  ],
  indicatorColor: "#6b7280",
};

const swiftBase: EnemyUpgradeConfig = {
  id: "swift",
  name: "Swift",
  description: "",
  displayRank: 1,
  tiers: [
    { speedMultiplier: 1.35, rewardMultiplier: 1.2 },
    { speedMultiplier: 1.5, rewardMultiplier: 1.08 },
    { speedMultiplier: 1.7, rewardMultiplier: 1.111 },
  ],
  indicatorColor: "#fbbf24",
};

const slowResistanceBase: EnemyUpgradeConfig = {
  id: "slowResistance",
  name: "Unstoppable",
  description: "",
  displayRank: 2,
  tiers: [
    { slowResistance: 0.25, rewardMultiplier: 1.1 },
    { slowResistance: 0.65, rewardMultiplier: 1.1 },
    { slowResistance: 1, rewardMultiplier: 1.23 },
  ],
  indicatorColor: "#8b5cf6",
};

const regeneratingBase: EnemyUpgradeConfig = {
  id: "regenerating",
  name: "Regenerating",
  description: "",
  displayRank: 2,
  tiers: [
    { regeneration: 5, rewardMultiplier: 1.15 },
    { regeneration: 10, rewardMultiplier: 1.1 },
    { regeneration: 15, rewardMultiplier: 1.145 },
  ],
  indicatorColor: "#22c55e",
};

const reinforcementsBase: EnemyUpgradeConfig = {
  id: "reinforcements",
  name: "Reinforcements",
  description: "",
  displayRank: 2,
  tiers: [
    { countGrowth: 0.2, rewardMultiplier: 1 },
    { countGrowth: 0.4, rewardMultiplier: 1.08 },
    { countGrowth: 0.65, rewardMultiplier: 1.18 },
  ],
  indicatorColor: "#f97316",
};

const allUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> = {
  armored: armoredBase,
  swift: swiftBase,
  slowResistance: slowResistanceBase,
  regenerating: regeneratingBase,
  reinforcements: reinforcementsBase,
};

describe("getTieredUpgradeEffect", () => {
  it("returns the tier-1 values from the config", () => {
    const e = getTieredUpgradeEffect(armoredBase, 1);
    expect(e.healthMultiplier).toBe(1.5);
    expect(e.rewardMultiplier).toBe(1.1);
  });

  it("replaces the previous tier's value (no cumulative stacking)", () => {
    // Tier II is exactly +75% HP (1.75), not tier I's +50% scaled up.
    const t2 = getTieredUpgradeEffect(armoredBase, 2);
    const t3 = getTieredUpgradeEffect(armoredBase, 3);
    expect(t2.healthMultiplier).toBe(1.75);
    expect(t3.healthMultiplier).toBe(2);
    expect(t2.rewardMultiplier).toBe(1.21);
    expect(t3.rewardMultiplier).toBe(1.375);
  });

  it("reads each tier's absolute speed from the config", () => {
    expect(getTieredUpgradeEffect(swiftBase, 1).speedMultiplier).toBe(1.35);
    expect(getTieredUpgradeEffect(swiftBase, 2).speedMultiplier).toBe(1.5);
    expect(getTieredUpgradeEffect(swiftBase, 3).speedMultiplier).toBe(1.7);
  });

  it("reads each tier's absolute slow resistance from the config", () => {
    expect(getTieredUpgradeEffect(slowResistanceBase, 1).slowResistance).toBe(
      0.25
    );
    expect(getTieredUpgradeEffect(slowResistanceBase, 2).slowResistance).toBe(
      0.65
    );
    expect(getTieredUpgradeEffect(slowResistanceBase, 3).slowResistance).toBe(
      1
    );
  });

  it("reads each tier's absolute regeneration from the config", () => {
    expect(getTieredUpgradeEffect(regeneratingBase, 1).regeneration).toBe(5);
    expect(getTieredUpgradeEffect(regeneratingBase, 2).regeneration).toBe(10);
    expect(getTieredUpgradeEffect(regeneratingBase, 3).regeneration).toBe(15);
  });

  it("treats a tier without a field as granting nothing of that kind", () => {
    const sparse: EnemyUpgradeConfig = {
      id: "armored",
      name: "Armored",
      description: "",
      displayRank: 1,
      tiers: [
        {},
        { healthMultiplier: 1.25 },
        { healthMultiplier: 1.5 },
      ],
      indicatorColor: "#6b7280",
    };
    const t1 = getTieredUpgradeEffect(sparse, 1);
    expect(t1.healthMultiplier).toBeUndefined();
    expect(t1.rewardMultiplier).toBe(1);
    expect(getTieredUpgradeEffect(sparse, 2).healthMultiplier).toBe(1.25);
  });

  it("describes Unstoppable as % slow resistance below full immunity", () => {
    expect(formatTieredUpgradeSummary(slowResistanceBase, 1)).toContain(
      "+25% slow resistance"
    );
    expect(formatTieredUpgradeSummary(slowResistanceBase, 2)).toContain(
      "+65% slow resistance"
    );
    expect(formatTieredUpgradeSummary(slowResistanceBase, 3)).toContain(
      "Slow immune"
    );
  });

  it("omits the gold bonus from the summary (it is shown separately per pick)", () => {
    expect(formatTieredUpgradeSummary(slowResistanceBase, 1)).not.toContain(
      "% gold"
    );
    expect(formatTieredUpgradeSummary(armoredBase, 1)).not.toContain("% gold");
    expect(formatTieredUpgradeSummary(armoredBase, 1)).toBe("+50% HP");
  });

  it("describes each reinforcement tier as the absolute +X% enemies", () => {
    expect(formatTieredUpgradeSummary(reinforcementsBase, 1)).toBe(
      "+20% enemies"
    );
    expect(formatTieredUpgradeSummary(reinforcementsBase, 2)).toBe(
      "+40% enemies"
    );
    expect(formatTieredUpgradeSummary(reinforcementsBase, 3)).toBe(
      "+65% enemies"
    );
  });

  it("keeps the stacked total effect at the top-tier count multiplier", () => {
    const total = getTotalUpgradeEffectForStack(reinforcementsBase, 3);
    expect(total.countMultiplier).toBe(1.65);
    expect(total.rewardMultiplier).toBeCloseTo(1 * 1.08 * 1.18, 5);
  });

  it("reports the per-pick gold bonus percentage", () => {
    expect(getTierRewardBonusPercent(slowResistanceBase, 1)).toBe(10);
    expect(getTierRewardBonusPercent(armoredBase, 1)).toBe(10);
    expect(getTierRewardBonusPercent(armoredBase, 3)).toBe(38);
  });
});

describe("stack helpers", () => {
  it("getStackTierForEnemy caps at 3", () => {
    const stack: EnemyUpgradeId[] = [
      "armored",
      "armored",
      "armored",
      "armored",
    ];
    expect(getStackTierForEnemy("armored", stack)).toBe(3);
  });

  it("getUniqueUpgradeIdsInStackOrder preserves first-seen order", () => {
    expect(
      getUniqueUpgradeIdsInStackOrder(["swift", "armored", "swift"])
    ).toEqual(["swift", "armored"]);
  });

  it("countUpgradePicks counts occurrences", () => {
    expect(countUpgradePicks(["armored", "swift", "armored"], "armored")).toBe(
      2
    );
  });
});

describe("getTotalRewardMultiplierFromStack", () => {
  it("multiplies per-pick tier rewards in order", () => {
    const stack: EnemyUpgradeId[] = ["armored", "armored"];
    expect(getTotalRewardMultiplierFromStack(stack, allUpgrades)).toBeCloseTo(
      1.1 * 1.21,
      5
    );
  });
});

describe("getTotalUpgradeEffectForStack", () => {
  it("uses the top-tier stat effect and stacked gold at tier 2", () => {
    const total = getTotalUpgradeEffectForStack(armoredBase, 2);
    // The total HP effect is exactly tier II's absolute value (1.75), not a
    // stack of tier I + tier II.
    expect(total.healthMultiplier).toBe(1.75);
    expect(total.rewardMultiplier).toBeCloseTo(1.1 * 1.21, 5);
  });

  it("keeps single-pick values at tier 1", () => {
    const total = getTotalUpgradeEffectForStack(armoredBase, 1);
    expect(total.healthMultiplier).toBe(1.5);
    expect(total.rewardMultiplier).toBe(1.1);
  });

  it("keeps the top-tier slow resistance by tier 3", () => {
    expect(
      getTotalUpgradeEffectForStack(slowResistanceBase, 3).slowResistance
    ).toBe(1);
    expect(
      getTotalUpgradeEffectForStack(slowResistanceBase, 2).slowResistance
    ).toBe(0.65);
  });

  it("gets the same gold multiplier as the per-pick product", () => {
    const stack: EnemyUpgradeId[] = ["armored", "armored"];
    expect(
      getTotalRewardMultiplierFromStack(stack, allUpgrades)
    ).toBeCloseTo(
      getTotalUpgradeEffectForStack(armoredBase, 2).rewardMultiplier,
      5
    );
  });
});

describe("getTotalRewardBonusPercentForStack", () => {
  it("rounds the stacked gold bonus percentage", () => {
    expect(getTotalRewardBonusPercentForStack(armoredBase, 1)).toBe(10);
    expect(getTotalRewardBonusPercentForStack(armoredBase, 2)).toBe(33);
    expect(getTotalRewardBonusPercentForStack(slowResistanceBase, 3)).toBe(49);
  });
});

describe("getTierRoman", () => {
  it("maps tiers to roman numerals", () => {
    expect(getTierRoman(1)).toBe("I");
    expect(getTierRoman(2)).toBe("II");
    expect(getTierRoman(3)).toBe("III");
  });
});

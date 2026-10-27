import { describe, expect, it } from "vitest";

import type { EnemyUpgradeConfig, EnemyUpgradeId } from "../core/types/game";

import {
  countUpgradePicks,
  formatTieredUpgradeSummary,
  formatTotalUpgradeSummary,
  getStackTierForEnemy,
  getTieredUpgradeEffect,
  getTierRewardBonusPercent,
  getTierRoman,
  getTotalRewardBonusPercentForStack,
  getTotalRewardMultiplierFromStack,
  getTotalUpgradeEffectForStack,
  getUniqueUpgradeIdsInStackOrder,
} from "./enemyUpgradeTierEffects";

const armoredBase: EnemyUpgradeConfig = {
  id: "armored",
  name: "Armored",
  description: "",
  displayRank: 1,
  healthMultiplier: 1.5,
  rewardMultiplier: 1.4,
  indicatorColor: "#6b7280",
};

const swiftBase: EnemyUpgradeConfig = {
  id: "swift",
  name: "Swift",
  description: "",
  displayRank: 1,
  speedMultiplier: 1.3,
  rewardMultiplier: 1.3,
  indicatorColor: "#fbbf24",
};

const slowResistanceBase: EnemyUpgradeConfig = {
  id: "slowResistance",
  name: "Unstoppable",
  description: "",
  displayRank: 2,
  rewardMultiplier: 1.5,
  resistances: { slow: 0.25 },
  indicatorColor: "#8b5cf6",
};

const allUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> = {
  armored: armoredBase,
  swift: swiftBase,
  slowResistance: slowResistanceBase,
  regenerating: {
    id: "regenerating",
    name: "Regenerating",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.6,
    abilities: { regeneration: 3 },
    indicatorColor: "#22c55e",
  },
};

describe("getTieredUpgradeEffect", () => {
  it("uses config base stats at tier 1 for armored", () => {
    const e = getTieredUpgradeEffect(armoredBase, 1);
    expect(e.healthMultiplier).toBe(1.5);
    expect(e.rewardMultiplier).toBe(1.4);
  });

  it("increases armored tier 2 and 3 relative to tier 1", () => {
    const t2 = getTieredUpgradeEffect(armoredBase, 2);
    const t3 = getTieredUpgradeEffect(armoredBase, 3);
    expect(t2.healthMultiplier!).toBeGreaterThan(1.5);
    expect(t3.healthMultiplier!).toBeGreaterThan(t2.healthMultiplier!);
    expect(t2.rewardMultiplier).toBeGreaterThan(1.4);
    expect(t3.rewardMultiplier).toBeGreaterThan(t2.rewardMultiplier);
  });

  it("scales swift speed and reward by tier", () => {
    const t1 = getTieredUpgradeEffect(swiftBase, 1);
    const t3 = getTieredUpgradeEffect(swiftBase, 3);
    expect(t1.speedMultiplier).toBe(1.3);
    expect(t3.speedMultiplier!).toBeGreaterThan(1.3);
  });

  it("scales Unstoppable slow resistance by tier and caps at full immunity", () => {
    const t1 = getTieredUpgradeEffect(slowResistanceBase, 1);
    const t2 = getTieredUpgradeEffect(slowResistanceBase, 2);
    const t3 = getTieredUpgradeEffect(slowResistanceBase, 3);
    expect(t1.slowResistance).toBe(0.25);
    expect(t2.slowResistance).toBeCloseTo(0.66);
    expect(t3.slowResistance).toBe(1);
  });

  it("grants full immunity at tier 3 even for a low base resistance", () => {
    const lowBase = { ...slowResistanceBase, resistances: { slow: 0.2 } };
    expect(getTieredUpgradeEffect(lowBase, 1).slowResistance).toBe(0.2);
    expect(getTieredUpgradeEffect(lowBase, 2).slowResistance).toBeCloseTo(0.528);
    expect(getTieredUpgradeEffect(lowBase, 3).slowResistance).toBe(1);
  });

  it("keeps full immunity for a base resistance of 1 at every tier", () => {
    const fullImmune = { ...slowResistanceBase, resistances: { slow: 1 } };
    for (const tier of [1, 2, 3] as const) {
      expect(getTieredUpgradeEffect(fullImmune, tier).slowResistance).toBe(1);
    }
  });

  it("describes Unstoppable as % slow resistance below full immunity", () => {
    expect(formatTieredUpgradeSummary(slowResistanceBase, 1)).toContain(
      "+25% slow resistance"
    );
    expect(formatTieredUpgradeSummary(slowResistanceBase, 2)).toContain(
      "+66% slow resistance"
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

  it("reports the per-pick gold bonus percentage", () => {
    expect(getTierRewardBonusPercent(slowResistanceBase, 1)).toBe(50);
    expect(getTierRewardBonusPercent(armoredBase, 1)).toBe(40);
    expect(getTierRewardBonusPercent(armoredBase, 2)).toBe(54);
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
    const r1 = getTieredUpgradeEffect(armoredBase, 1).rewardMultiplier;
    const r2 = getTieredUpgradeEffect(armoredBase, 2).rewardMultiplier;
    expect(getTotalRewardMultiplierFromStack(stack, allUpgrades)).toBeCloseTo(
      r1 * r2,
      5
    );
  });
});

describe("getTotalUpgradeEffectForStack", () => {
  it("uses the top-tier stat effect and stacked gold at tier 2", () => {
    const total = getTotalUpgradeEffectForStack(armoredBase, 2);
    expect(total.healthMultiplier).toBeCloseTo(1.575, 5);
    expect(total.rewardMultiplier).toBeCloseTo(2.156, 5);
  });

  it("keeps single-pick values at tier 1", () => {
    const total = getTotalUpgradeEffectForStack(armoredBase, 1);
    expect(total.healthMultiplier).toBe(1.5);
    expect(total.rewardMultiplier).toBe(1.4);
  });

  it("caps slow resistance at full immunity by tier 3", () => {
    expect(getTotalUpgradeEffectForStack(slowResistanceBase, 3).slowResistance).toBe(1);
    expect(getTotalUpgradeEffectForStack(slowResistanceBase, 2).slowResistance).toBeCloseTo(
      0.66,
      2
    );
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

describe("formatTotalUpgradeSummary", () => {
  it("is the plain summary at tier 1", () => {
    expect(formatTotalUpgradeSummary(armoredBase, 1)).toBe("+50% HP");
    expect(formatTotalUpgradeSummary(slowResistanceBase, 1)).toBe(
      "+25% slow resistance"
    );
  });

  it("shows the per-pick summary plus the total in parentheses", () => {
    expect(formatTotalUpgradeSummary(armoredBase, 2)).toBe(
      "+50% HP (total +57% HP)"
    );
    expect(formatTotalUpgradeSummary(swiftBase, 2)).toBe(
      "+30% speed (total +36% speed)"
    );
    expect(formatTotalUpgradeSummary(slowResistanceBase, 2)).toBe(
      "+25% slow resistance (total +66% slow resistance)"
    );
    expect(formatTotalUpgradeSummary(slowResistanceBase, 3)).toBe(
      "+25% slow resistance (total Slow immune)"
    );
  });
});

describe("getTotalRewardBonusPercentForStack", () => {
  it("rounds the stacked gold bonus percentage", () => {
    expect(getTotalRewardBonusPercentForStack(armoredBase, 1)).toBe(40);
    expect(getTotalRewardBonusPercentForStack(armoredBase, 2)).toBe(116);
    expect(getTotalRewardBonusPercentForStack(slowResistanceBase, 3)).toBe(353);
  });
});

describe("getTierRoman", () => {
  it("maps tiers to roman numerals", () => {
    expect(getTierRoman(1)).toBe("I");
    expect(getTierRoman(2)).toBe("II");
    expect(getTierRoman(3)).toBe("III");
  });
});

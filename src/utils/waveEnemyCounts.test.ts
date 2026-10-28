import { describe, expect, it } from "vitest";

import type {
  EnemyUpgradeConfig,
  EnemyUpgradeId,
  WaveEnemyGroup,
} from "../core/types/game";
import {
  applyWaveEnemyCountMultiplier,
  getWaveCountMultiplierForStack,
} from "./waveEnemyCounts";

const reinforcements: EnemyUpgradeConfig = {
  id: "reinforcements",
  name: "Reinforcements",
  description: "",
  displayRank: 2,
  rewardMultiplier: 1.3,
  countGrowth: 0.2,
  indicatorColor: "#f97316",
};

const otherUpgrades: Partial<Record<EnemyUpgradeId, EnemyUpgradeConfig>> = {
  armored: {
    id: "armored",
    name: "Armored",
    description: "",
    displayRank: 1,
    rewardMultiplier: 1.15,
    healthMultiplier: 1.5,
    indicatorColor: "#6b7280",
  },
};

const allUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> = {
  armored: otherUpgrades.armored!,
  swift: {
    id: "swift",
    name: "Swift",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.35,
    indicatorColor: "#fbbf24",
  },
  slowResistance: {
    id: "slowResistance",
    name: "Unstoppable",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.25,
    indicatorColor: "#8b5cf6",
  },
  regenerating: {
    id: "regenerating",
    name: "Regenerating",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.3,
    indicatorColor: "#22c55e",
  },
  reinforcements,
};

const groups: WaveEnemyGroup[] = [
  { type: "basic", count: 5, spawnInterval: 1 },
  { type: "tank", count: 3, spawnInterval: 2 },
];

describe("getWaveCountMultiplierForStack", () => {
  it("returns 1 without the upgrade or without configs", () => {
    expect(getWaveCountMultiplierForStack(["armored"], allUpgrades)).toBe(1);
    expect(getWaveCountMultiplierForStack([], allUpgrades)).toBe(1);
    expect(getWaveCountMultiplierForStack(["reinforcements"], null)).toBe(1);
  });

  it("maps the pick count to the tier multiplier (1x, 2x, 3x)", () => {
    expect(
      getWaveCountMultiplierForStack(["reinforcements"], allUpgrades)
    ).toBe(1.2);
    expect(
      getWaveCountMultiplierForStack(
        ["reinforcements", "armored", "reinforcements"],
        allUpgrades
      )
    ).toBe(1.4);
    // Extra picks beyond tier 3 stay maxed.
    expect(
      getWaveCountMultiplierForStack(
        [
          "reinforcements",
          "reinforcements",
          "reinforcements",
          "reinforcements",
        ],
        allUpgrades
      )
    ).toBe(1.65);
  });
});

describe("applyWaveEnemyCountMultiplier", () => {
  it("rounds each group's count up and preserves the rest of the group", () => {
    const scaled = applyWaveEnemyCountMultiplier(groups, 1.4);
    expect(scaled).toEqual([
      { type: "basic", count: 7, spawnInterval: 1 },
      { type: "tank", count: 5, spawnInterval: 2 },
    ]);
    // 5 * 1.4 = 7.000000000000001 without exact math; ceil is stable either way.
    expect(scaled[0].count).toBe(7);
  });

  it("rounds up (ceil), not toward zero", () => {
    const scaled = applyWaveEnemyCountMultiplier(groups, 1.2);
    expect(scaled.map((g) => g.count)).toEqual([6, 4]); // 5*1.2=6, 3*1.2=3.6->4
  });

  it("returns fresh group objects so the original config is not mutated", () => {
    const scaled = applyWaveEnemyCountMultiplier(groups, 1.2);
    expect(scaled).not.toBe(groups);
    expect(scaled[0]).not.toBe(groups[0]);
    groups[0].count = 999;
    expect(scaled[0].count).toBe(6);
  });

  it("keeps the relative enemy mix when scaling", () => {
    const scaled = applyWaveEnemyCountMultiplier(groups, 1.4);
    expect(scaled[0].count).toBeGreaterThan(scaled[1].count);
  });
});

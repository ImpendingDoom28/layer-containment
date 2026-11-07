import { describe, expect, it } from "vitest";

import type {
  BossConfig,
  EnemyUpgradeConfig,
  EnemyUpgradeId,
} from "../core/types/game";
import {
  bossHealthForWave,
  bossHealthWithUpgrades,
  isBossWave,
} from "./bossHp";

const colossus: BossConfig = {
  name: "Colossus",
  everyNthWave: 4,
  baseStats: {
    health: 1000,
    speed: 0.6,
    size: 1.4,
    healthLoss: 5,
    reward: 250,
  },
  hpGrowthPerAppearance: 1.5,
};

const flatBoss: BossConfig = {
  name: "Sentinel",
  everyNthWave: 4,
  baseStats: {
    health: 1400,
    speed: 0.8,
    size: 1.6,
    healthLoss: 6,
    reward: 350,
  },
};

describe("isBossWave", () => {
  it("marks every everyNthWave-th wave as a boss wave", () => {
    expect(isBossWave(colossus, 4)).toBe(true);
    expect(isBossWave(colossus, 8)).toBe(true);
    expect(isBossWave(colossus, 12)).toBe(true);
    expect(isBossWave(colossus, 1)).toBe(false);
    expect(isBossWave(colossus, 3)).toBe(false);
    expect(isBossWave(colossus, 5)).toBe(false);
  });

  it("is never a boss wave when the level has no boss", () => {
    expect(isBossWave(null, 4)).toBe(false);
    expect(isBossWave(undefined, 4)).toBe(false);
  });

  it("treats wave 0 as not a boss wave", () => {
    expect(isBossWave(colossus, 0)).toBe(false);
  });
});

describe("bossHealthForWave", () => {
  it("scales HP by hpGrowthPerAppearance per later appearance", () => {
    expect(bossHealthForWave(colossus, 4)).toBe(1000);
    expect(bossHealthForWave(colossus, 8)).toBe(1500);
    expect(bossHealthForWave(colossus, 12)).toBe(2250);
  });

  it("keeps a flat HP when no growth factor is set", () => {
    expect(bossHealthForWave(flatBoss, 4)).toBe(1400);
    expect(bossHealthForWave(flatBoss, 8)).toBe(1400);
    expect(bossHealthForWave(flatBoss, 16)).toBe(1400);
  });

  it("returns 0 for non-boss waves and boss-less levels", () => {
    expect(bossHealthForWave(colossus, 3)).toBe(0);
    expect(bossHealthForWave(colossus, 5)).toBe(0);
    expect(bossHealthForWave(null, 4)).toBe(0);
    expect(bossHealthForWave(undefined, 4)).toBe(0);
  });
});

const armored: EnemyUpgradeConfig = {
  id: "armored",
  name: "Armored",
  description: "+health",
  displayRank: 1,
  tiers: [
    { healthMultiplier: 1.5 },
    { healthMultiplier: 1.75 },
    { healthMultiplier: 2 },
  ],
  indicatorColor: "#6b7280",
};

const swift: EnemyUpgradeConfig = {
  ...armored,
  id: "swift",
  tiers: [{ speedMultiplier: 1.3 }, { speedMultiplier: 1.6 }, { speedMultiplier: 2 }],
};

// The full upgrade table the game config loads; the tests below only ever
// pick armored/swift, but the lookup signature takes the whole record.
const enemyUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> = {
  armored,
  swift,
  slowResistance: {
    id: "slowResistance",
    name: "Unstoppable",
    description: "",
    displayRank: 2,
    tiers: [
      { slowResistance: 0.25, rewardMultiplier: 1.05 },
      { slowResistance: 0.65, rewardMultiplier: 1.05 },
      { slowResistance: 1, rewardMultiplier: 1.115 },
    ],
    indicatorColor: "#8b5cf6",
  },
  regenerating: {
    id: "regenerating",
    name: "Regenerating",
    description: "",
    displayRank: 2,
    tiers: [
      { regeneration: 5, rewardMultiplier: 1.075 },
      { regeneration: 10, rewardMultiplier: 1.05 },
      { regeneration: 15, rewardMultiplier: 1.0725 },
    ],
    indicatorColor: "#22c55e",
  },
  reinforcements: {
    id: "reinforcements",
    name: "Reinforcements",
    description: "",
    displayRank: 2,
    tiers: [
      { countGrowth: 0.2, rewardMultiplier: 1 },
      { countGrowth: 0.4, rewardMultiplier: 1.04 },
      { countGrowth: 0.65, rewardMultiplier: 1.09 },
    ],
    indicatorColor: "#f97316",
  },
  missingOut: {
    id: "missingOut",
    name: "Missing Out",
    description: "",
    displayRank: 2,
    tiers: [
      { dodgeChance: 0.05, rewardMultiplier: 1.1 },
      { dodgeChance: 0.1, rewardMultiplier: 1.1 },
      { dodgeChance: 0.15, rewardMultiplier: 1.1 },
    ],
    indicatorColor: "#38bdf8",
  },
};

describe("bossHealthWithUpgrades", () => {
  it("matches the bare boss health with an empty upgrade stack", () => {
    expect(bossHealthWithUpgrades(colossus, 4, [], enemyUpgrades)).toBe(1000);
    expect(bossHealthWithUpgrades(colossus, 8, [], enemyUpgrades)).toBe(1500);
  });

  it("applies the upgrade's health multiplier, per pick tier", () => {
    // Tier I: 1000 * 1.5 = 1500 (the spawn does the same rounding).
    expect(
      bossHealthWithUpgrades(colossus, 4, ["armored"], enemyUpgrades)
    ).toBe(1500);
    // Tier II: 1000 * 1.75 = 1750.
    expect(
      bossHealthWithUpgrades(
        colossus,
        4,
        ["armored", "armored"],
        enemyUpgrades
      )
    ).toBe(1750);
    // Tier III: 1000 * 2 = 2000 (picks beyond tier 3 are clamped).
    expect(
      bossHealthWithUpgrades(
        colossus,
        4,
        ["armored", "armored", "armored", "armored"],
        enemyUpgrades
      )
    ).toBe(2000);
  });

  it("scales on top of the appearance growth", () => {
    // Appearance 2 (wave 8): 1500 * 1.5 = 2250.
    expect(
      bossHealthWithUpgrades(colossus, 8, ["armored"], enemyUpgrades)
    ).toBe(2250);
  });

  it("ignores upgrades without a health multiplier and unknown ids", () => {
    expect(
      bossHealthWithUpgrades(colossus, 4, ["swift"], enemyUpgrades)
    ).toBe(1000);
  });

  it("returns 0 for non-boss waves and boss-less levels", () => {
    expect(
      bossHealthWithUpgrades(colossus, 3, ["armored"], enemyUpgrades)
    ).toBe(0);
    expect(bossHealthWithUpgrades(null, 4, ["armored"], enemyUpgrades)).toBe(0);
    expect(
      bossHealthWithUpgrades(undefined, 4, ["armored"], enemyUpgrades)
    ).toBe(0);
  });
});

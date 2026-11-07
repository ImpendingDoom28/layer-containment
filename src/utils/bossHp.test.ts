import { describe, expect, it } from "vitest";

import type { BossConfig } from "../core/types/game";
import { bossHealthForWave, isBossWave } from "./bossHp";

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

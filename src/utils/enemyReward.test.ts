import { describe, expect, it } from "vitest";

import { computeSpawnedReward } from "./enemyReward";

describe("computeSpawnedReward", () => {
  it("scales the base reward by the total multiplier", () => {
    expect(computeSpawnedReward(10, 1.1)).toBe(11);
    expect(computeSpawnedReward(10, 2)).toBe(20);
    expect(computeSpawnedReward(10, 0.5)).toBe(5);
  });

  it("floors positive-reward enemies at 1 gold when the multiplier rounds them to zero", () => {
    // A 10-gold Troop under a ~0.04 total multiplier rounds to 0; it pays 1.
    expect(computeSpawnedReward(10, 0.04)).toBe(1);
    // A 1-gold reward at 0.4 rounds to 0; it pays 1.
    expect(computeSpawnedReward(1, 0.4)).toBe(1);
    // The floor never raises an already-positive reward.
    expect(computeSpawnedReward(10, 0.2)).toBe(2);
  });

  it("keeps zero-reward enemies (splitter shrapnel) at 0", () => {
    expect(computeSpawnedReward(0, 1.1)).toBe(0);
    expect(computeSpawnedReward(0, 0.5)).toBe(0);
  });
});

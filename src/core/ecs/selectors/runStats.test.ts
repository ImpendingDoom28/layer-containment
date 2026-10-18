import { describe, expect, it, beforeEach } from "vitest";

import { getRunStats } from "./runStats";
import { statsActions } from "../actions/statsActions";
import { runStatsSystem } from "../systems/statsSystem";
import {
  IsStats,
  damageDealtRequest,
  moneyEarnedRequest,
  moneySpentRequest,
} from "../traits/stats";
import { testWorld } from "../world";

describe("getRunStats", () => {
  beforeEach(() => {
    for (const entity of [...testWorld.query(IsStats)]) {
      entity.destroy();
    }
  });

  it("returns an empty snapshot when no run is active", () => {
    const stats = getRunStats(testWorld);
    expect(stats).toEqual({
      totalEarned: 0,
      damageByTowerType: {},
      spendByTowerType: {},
      killsByTowerType: {},
    });
  });

  it("returns a plain, decoupled snapshot of the run totals", () => {
    statsActions(testWorld).startRunStats();
    testWorld.spawn(moneySpentRequest({ towerType: "basic", amount: 10 }));
    testWorld.spawn(moneyEarnedRequest({ amount: 7 }));
    testWorld.spawn(
      damageDealtRequest({
        towerType: "laser",
        enemyType: "fast",
        amount: 3,
        killed: true,
      })
    );
    runStatsSystem(testWorld);

    const stats = getRunStats(testWorld);
    expect(stats.totalEarned).toBe(7);
    expect(stats.spendByTowerType).toEqual({ basic: 10 });
    expect(stats.damageByTowerType).toEqual({ laser: 3 });
    expect(stats.killsByTowerType).toEqual({ laser: { fast: 1 } });

    // Mutating the snapshot must not affect the ECS record.
    stats.damageByTowerType.laser = 999;
    stats.totalEarned = 0;
    expect(getRunStats(testWorld).damageByTowerType).toEqual({ laser: 3 });
    expect(getRunStats(testWorld).totalEarned).toBe(7);
  });
});

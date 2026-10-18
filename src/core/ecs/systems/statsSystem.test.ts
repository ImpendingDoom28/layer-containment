import { describe, expect, it, beforeEach } from "vitest";

import { runStatsSystem } from "./statsSystem";
import { statsActions } from "../actions/statsActions";
import {
  DamageByTowerType,
  IsStats,
  KillsByTowerType,
  MoneyEarned,
  SpendByTowerType,
  damageDealtRequest,
  moneyEarnedRequest,
  moneySpentRequest,
} from "../traits/stats";
import { testWorld } from "../world";

const clearRun = () => {
  for (const entity of [...testWorld.query(IsStats)]) {
    entity.destroy();
  }
  for (const entity of [...testWorld.query(damageDealtRequest)]) {
    entity.destroy();
  }
  for (const entity of [...testWorld.query(moneyEarnedRequest)]) {
    entity.destroy();
  }
  for (const entity of [...testWorld.query(moneySpentRequest)]) {
    entity.destroy();
  }
};

describe("statsSystem", () => {
  beforeEach(() => {
    clearRun();
  });

  it("folds damage, spend, and earned receipts into the stats entity", () => {
    statsActions(testWorld).startRunStats();
    testWorld.spawn(
      damageDealtRequest({
        towerType: "basic",
        enemyType: "tank",
        amount: 5,
        killed: false,
      })
    );
    testWorld.spawn(moneySpentRequest({ towerType: "basic", amount: 10 }));
    testWorld.spawn(moneyEarnedRequest({ amount: 4 }));

    runStatsSystem(testWorld);

    const stats = testWorld.queryFirst(IsStats);
    expect(stats).toBeDefined();
    expect(stats?.get(DamageByTowerType)).toEqual({ basic: 5 });
    expect(stats?.get(SpendByTowerType)).toEqual({ basic: 10 });
    expect(stats?.get(MoneyEarned)).toEqual({ total: 4 });
    // No kill flagged yet, so the kills record stays empty.
    expect(stats?.get(KillsByTowerType)).toEqual({});

    // Receipts are destroyed after being consumed.
    expect(testWorld.query(damageDealtRequest)).toHaveLength(0);
    expect(testWorld.query(moneySpentRequest)).toHaveLength(0);
    expect(testWorld.query(moneyEarnedRequest)).toHaveLength(0);
  });

  it("credits a kill on the final hit, broken down by enemy type", () => {
    statsActions(testWorld).startRunStats();
    testWorld.spawn(
      damageDealtRequest({
        towerType: "laser",
        enemyType: "fast",
        amount: 2,
        killed: false,
      })
    );
    testWorld.spawn(
      damageDealtRequest({
        towerType: "laser",
        enemyType: "fast",
        amount: 3,
        killed: true,
      })
    );
    testWorld.spawn(
      damageDealtRequest({
        towerType: "aoe",
        enemyType: "basic",
        amount: 7,
        killed: true,
      })
    );

    runStatsSystem(testWorld);

    const stats = testWorld.queryFirst(IsStats);
    // Effective damage is summed per tower type.
    expect(stats?.get(DamageByTowerType)).toEqual({ laser: 5, aoe: 7 });
    expect(stats?.get(KillsByTowerType)).toEqual({
      laser: { fast: 1 },
      aoe: { basic: 1 },
    });
  });

  it("keeps per-hit attribution when two towers hit the same enemy in one frame", () => {
    statsActions(testWorld).startRunStats();
    testWorld.spawn(
      damageDealtRequest({
        towerType: "basic",
        enemyType: "tank",
        amount: 10,
        killed: false,
      })
    );
    testWorld.spawn(
      damageDealtRequest({
        towerType: "chain",
        enemyType: "tank",
        amount: 6,
        killed: false,
      })
    );

    runStatsSystem(testWorld);

    const stats = testWorld.queryFirst(IsStats);
    expect(stats?.get(DamageByTowerType)).toEqual({ basic: 10, chain: 6 });
  });

  it("does nothing when there is no stats entity (main menu)", () => {
    // No run started: a stray receipt must not crash or leave a stats entity.
    expect(() => runStatsSystem(testWorld)).not.toThrow();
    expect(testWorld.queryFirst(IsStats)).toBeUndefined();
  });

  it("runs a no-op frame when no receipts are pending", () => {
    statsActions(testWorld).startRunStats();
    const before = testWorld.queryFirst(IsStats);

    expect(() => runStatsSystem(testWorld)).not.toThrow();
    // The stats entity is untouched and still present.
    expect(testWorld.queryFirst(IsStats)).toBe(before);
    expect(before?.get(MoneyEarned)).toEqual({ total: 0 });
  });
});

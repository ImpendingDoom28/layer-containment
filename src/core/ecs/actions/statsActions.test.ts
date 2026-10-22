import { describe, expect, it, beforeEach } from "vitest";

import { statsActions, sweepStatsReceipts } from "./statsActions";
import {
  DamageByTowerType,
  IsStats,
  MoneyEarned,
  RunEnded,
  damageDealtRequest,
  moneySpentRequest,
} from "../traits/stats";
import { testWorld } from "../world";

const clearRun = () => {
  for (const entity of [...testWorld.query(IsStats)]) {
    entity.destroy();
  }
  sweepStatsReceipts(testWorld);
};

describe("statsActions", () => {
  beforeEach(() => {
    clearRun();
  });

  it("startRunStats spawns a fresh, empty stats entity", () => {
    statsActions(testWorld).startRunStats();

    const stats = testWorld.queryFirst(IsStats);
    expect(stats).toBeDefined();
    expect(stats?.get(MoneyEarned)).toEqual({ total: 0 });
  });

  it("startRunStats replaces any existing stats entity", () => {
    statsActions(testWorld).startRunStats();
    statsActions(testWorld).startRunStats();

    expect(testWorld.query(IsStats)).toHaveLength(1);
  });

  it("sweeps leftover receipts from the previous run on restart", () => {
    // Run 1 ends but its final-frame receipts were never folded (the end
    // screen is up and the sim kept running). The player restarts without
    // returning to the main menu, so the old stats entity is still alive.
    statsActions(testWorld).startRunStats();
    testWorld.spawn(
      damageDealtRequest({
        towerType: "basic",
        enemyType: "basic",
        amount: 42,
        killed: true,
      })
    );
    testWorld.spawn(moneySpentRequest({ towerType: "laser", amount: 200 }));

    // Restart: the new run must not inherit run 1's pending receipts.
    statsActions(testWorld).startRunStats();

    expect(testWorld.query(damageDealtRequest)).toHaveLength(0);
    expect(testWorld.query(moneySpentRequest)).toHaveLength(0);
    const stats = testWorld.queryFirst(IsStats);
    expect(stats).toBeDefined();
    expect(stats?.get(MoneyEarned)).toEqual({ total: 0 });
    expect(stats?.get(DamageByTowerType)).toEqual({});
  });

  it("endRunStats destroys the stats entity and any pending receipts", () => {
    statsActions(testWorld).startRunStats();
    // Simulate receipts raised on the final frame that were never folded.
    testWorld.spawn(moneySpentRequest({ towerType: "basic", amount: 10 }));
    testWorld.spawn(
      damageDealtRequest({
        towerType: "basic",
        enemyType: "basic",
        amount: 1,
        killed: false,
      })
    );

    statsActions(testWorld).endRunStats();

    expect(testWorld.queryFirst(IsStats)).toBeUndefined();
    expect(testWorld.query(moneySpentRequest)).toHaveLength(0);
    expect(testWorld.query(damageDealtRequest)).toHaveLength(0);
  });

  it("recordTowerPurchase raises a spend receipt while a run is active", () => {
    statsActions(testWorld).startRunStats();

    statsActions(testWorld).recordTowerPurchase("basic", 10);

    const receipt = testWorld.queryFirst(moneySpentRequest);
    expect(receipt?.get(moneySpentRequest)).toEqual({ towerType: "basic", amount: 10 });
  });

  it("recordTowerPurchase is a no-op with no active run", () => {
    statsActions(testWorld).recordTowerPurchase("basic", 10);

    expect(testWorld.queryFirst(moneySpentRequest)).toBeUndefined();
  });

  it("markRunEnded tags the stats entity with RunEnded", () => {
    statsActions(testWorld).startRunStats();

    statsActions(testWorld).markRunEnded();

    const stats = testWorld.queryFirst(IsStats);
    expect(stats).toBeDefined();
    expect(testWorld.queryFirst(IsStats, RunEnded)).toBe(stats);
  });

  it("markRunEnded is a no-op with no active run", () => {
    statsActions(testWorld).markRunEnded();

    expect(testWorld.queryFirst(RunEnded)).toBeUndefined();
  });
});

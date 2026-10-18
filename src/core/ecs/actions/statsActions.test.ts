import { describe, expect, it, beforeEach } from "vitest";

import { statsActions } from "./statsActions";
import {
  IsStats,
  MoneyEarned,
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

  it("flushRunStats folds pending receipts immediately and keeps the stats entity", () => {
    statsActions(testWorld).startRunStats();
    testWorld.spawn(moneyEarnedRequest({ amount: 6 }));
    testWorld.spawn(moneySpentRequest({ towerType: "basic", amount: 12 }));

    statsActions(testWorld).flushRunStats();

    const stats = testWorld.queryFirst(IsStats);
    expect(stats).toBeDefined();
    expect(stats?.get(MoneyEarned)).toEqual({ total: 6 });
    // Receipts are consumed; the stats entity survives the flush.
    expect(testWorld.query(moneyEarnedRequest)).toHaveLength(0);
    expect(testWorld.query(moneySpentRequest)).toHaveLength(0);
    expect(testWorld.queryFirst(IsStats)).toBe(stats);
  });

  it("flushRunStats is a no-op with no active run", () => {
    expect(() => statsActions(testWorld).flushRunStats()).not.toThrow();
    expect(testWorld.queryFirst(IsStats)).toBeUndefined();
  });
});

import ReactThreeTestRenderer from "@react-three/test-renderer";
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
} from "vitest";

import { WorldProvider } from "koota/react";

import { statsActions } from "../../core/ecs/actions/statsActions";
import {
  DamageByTowerType,
  IsStats,
  MoneyEarned,
  RunEnded,
  damageDealtRequest,
  moneyEarnedRequest,
} from "../../core/ecs/traits/stats";
import { testWorld } from "../../core/ecs/world";
import { ApplyStatsSystem } from "./ApplyStatsSystem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const clearRun = () => {
  statsActions(testWorld).endRunStats();
};

describe("ApplyStatsSystem", () => {
  beforeEach(() => {
    clearRun();
  });

  afterEach(() => {
    clearRun();
  });

  it("folds pending receipts into the stats entity on the frame pass", async () => {
    statsActions(testWorld).startRunStats();
    testWorld.spawn(moneyEarnedRequest({ amount: 5 }));
    testWorld.spawn(
      damageDealtRequest({
        towerType: "basic",
        enemyType: "basic",
        amount: 3,
        killed: false,
      })
    );

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyStatsSystem />
      </WorldProvider>
    );

    try {
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 1);
      });

      // Receipts are consumed.
      expect(testWorld.queryFirst(moneyEarnedRequest)).toBeUndefined();
      expect(testWorld.queryFirst(damageDealtRequest)).toBeUndefined();
      // Folded into the stats entity.
      const stats = testWorld.queryFirst(IsStats);
      expect(stats).toBeDefined();
      expect(stats?.get(MoneyEarned)).toEqual({ total: 5 });
    } finally {
      renderer.unmount();
    }
  });

  it("sweeps a receipt raised after the last frame pass on unmount", async () => {
    statsActions(testWorld).startRunStats();

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyStatsSystem />
      </WorldProvider>
    );

    try {
      // Raised after the frame pass (the scene's final frame): no further
      // frame will consume it.
      testWorld.spawn(moneyEarnedRequest({ amount: 9 }));
      expect(testWorld.queryFirst(moneyEarnedRequest)).toBeDefined();
    } finally {
      await ReactThreeTestRenderer.act(async () => {
        renderer.unmount();
      });
    }

    expect(testWorld.queryFirst(moneyEarnedRequest)).toBeUndefined();
  });

  it("flushes same-frame receipts when the run ends and clears the RunEnded tag", async () => {
    statsActions(testWorld).startRunStats();

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyStatsSystem />
      </WorldProvider>
    );

    try {
      // The end-state transition and a killing blow land in the same frame,
      // before the next per-frame fold.
      testWorld.spawn(
        damageDealtRequest({
          towerType: "basic",
          enemyType: "basic",
          amount: 10,
          killed: true,
        })
      );
      statsActions(testWorld).markRunEnded();

      // The onAdd reaction folded the receipt synchronously...
      const stats = testWorld.queryFirst(IsStats);
      expect(stats?.get(DamageByTowerType)).toEqual({ basic: 10 });
      expect(testWorld.queryFirst(damageDealtRequest)).toBeUndefined();
      // ...and removed the tag, so the next end is a discrete event.
      expect(testWorld.queryFirst(IsStats, RunEnded)).toBeUndefined();
    } finally {
      await ReactThreeTestRenderer.act(async () => {
        renderer.unmount();
      });
    }
  });
});

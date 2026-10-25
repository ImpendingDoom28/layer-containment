import { beforeEach, describe, expect, it } from "vitest";

import { enemyActions } from "../actions/enemyActions";
import { getEnemySnapshots } from "../selectors/enemySnapshots";
import { splitRequest } from "../traits/split";
import { testWorld } from "../world";
import { useGameStore } from "../../stores/useGameStore";
import { useLevelStore } from "../../stores/useLevelStore";
import type { EnemyConfig, EnemyType } from "../../types/game";
import { runEnemySplitSystem } from "./enemySplitSystem";

const splitterRequest = (overrides: Partial<Record<string, number | string>> = {}) => ({
  type: "splitter" as const,
  color: "#06b6d4",
  health: 90,
  speed: 1.5,
  size: 0.45,
  healthLoss: 2,
  minChildren: 2,
  maxChildren: 4,
  x: 3,
  z: 4,
  pathProgress: 0.4,
  pathIndex: 1,
  ...overrides,
});

describe("runEnemySplitSystem", () => {
  let ids: number[];
  let idCounter: number;

  beforeEach(() => {
    useLevelStore.getState().resetLevelState();
    useGameStore.getState().setGameStatus("playing");
    useGameStore.setState({
      enemyTypes: {
        splitter: {
          id: "splitter",
          name: "Splitter",
          health: 90,
          speed: 1.5,
          reward: 18,
          color: "#06b6d4",
          size: 0.45,
          healthLoss: 2,
          split: { minChildren: 2, maxChildren: 4 },
        },
      } as Record<EnemyType, EnemyConfig>,
    });
    enemyActions(testWorld).clearAllEnemies();
    for (const entity of testWorld.query(splitRequest)) entity.destroy();
    ids = [];
    idCounter = 1000;
  });

  const nextId = () => {
    ids.push(idCounter);
    return idCounter++;
  };

  it("spawns a random number of weaker zero-reward children and consumes the request", () => {
    testWorld.spawn(splitRequest(splitterRequest()));
    runEnemySplitSystem(testWorld, nextId);

    const children = getEnemySnapshots(testWorld);
    expect(children.length).toBeGreaterThanOrEqual(2);
    expect(children.length).toBeLessThanOrEqual(4);

    for (const child of children) {
      expect(child.reward).toBe(0);
      // 90 * 0.3 = 27 health, 0.45 * 0.6 = 0.27 size.
      expect(child.health).toBe(27);
      expect(child.maxHealth).toBe(27);
      expect(child.size).toBeCloseTo(0.27);
      expect(child.speed).toBe(1.5);
      expect(child.type).toBe("splitter");
      // Children continue from near the death point: the path progress is
      // the death progress plus a small random scatter (±0.06), so they
      // spread along the path instead of stacking at one spot.
      expect(child.pathProgress).toBeGreaterThanOrEqual(0.4 - 0.06);
      expect(child.pathProgress).toBeLessThanOrEqual(0.4 + 0.06);
      expect(child.pathIndex).toBe(1);
      // x/z are the parent's death location at spawn; the movement system
      // re-derives them from pathProgress on the next frame.
      expect(child.x).toBe(3);
      expect(child.z).toBe(4);
      // No split config — a child can never split again.
      expect(child.split).toBeUndefined();
    }

    // The request entity is consumed.
    expect(testWorld.queryFirst(splitRequest)).toBeUndefined();
    // Children drew ids from the injected counter.
    expect(ids).toHaveLength(children.length);
  });

  it("scatters children along the path around the death progress", () => {
    // Force the max child count so the scatter has room to show.
    testWorld.spawn(
      splitRequest(splitterRequest({ minChildren: 4, maxChildren: 4 }))
    );
    runEnemySplitSystem(testWorld, nextId);

    const children = getEnemySnapshots(testWorld);
    expect(children).toHaveLength(4);
    // All within ±0.06 of the death progress...
    for (const child of children) {
      expect(child.pathProgress).toBeGreaterThanOrEqual(0.34);
      expect(child.pathProgress).toBeLessThanOrEqual(0.46);
    }
    // ...and not all stacked at the exact death progress.
    const progresses = children.map((child) => child.pathProgress);
    expect(new Set(progresses).size).toBeGreaterThan(1);
  });

  it("keeps children below the path exit when the death is near the end", () => {
    // A parent dying at 0.99 must not produce a child at progress 1: the
    // movement system's isAtPathEnd threshold (0.99) would treat it as
    // having reached the end, triggering the end handling (base damage).
    testWorld.spawn(
      splitRequest(splitterRequest({ minChildren: 4, maxChildren: 4, pathProgress: 0.99 }))
    );
    runEnemySplitSystem(testWorld, nextId);

    const children = getEnemySnapshots(testWorld);
    expect(children).toHaveLength(4);
    for (const child of children) {
      expect(child.pathProgress).toBeGreaterThanOrEqual(0);
      expect(child.pathProgress).toBeLessThan(0.99);
    }
  });

  it("spawns nothing and keeps the world clean when there is no request", () => {
    runEnemySplitSystem(testWorld, nextId);
    expect(getEnemySnapshots(testWorld)).toHaveLength(0);
    expect(testWorld.queryFirst(splitRequest)).toBeUndefined();
  });

  it("normalizes a misordered min > max to the smaller/larger bounds", () => {
    // Bounds are treated as unordered: 5 and 2 become the range [2, 5].
    testWorld.spawn(splitRequest(splitterRequest({ minChildren: 5, maxChildren: 2 })));
    runEnemySplitSystem(testWorld, nextId);

    const count = getEnemySnapshots(testWorld).length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(5);
    expect(testWorld.queryFirst(splitRequest)).toBeUndefined();
  });

  it("spawns exactly minChildren when min and max are equal", () => {
    testWorld.spawn(splitRequest(splitterRequest({ minChildren: 3, maxChildren: 3 })));
    runEnemySplitSystem(testWorld, nextId);

    expect(getEnemySnapshots(testWorld)).toHaveLength(3);
    expect(testWorld.queryFirst(splitRequest)).toBeUndefined();
  });

  it("leaves a request with no matching config as children with a fallback name", () => {
    useGameStore.setState({ enemyTypes: null });
    testWorld.spawn(splitRequest(splitterRequest()));
    runEnemySplitSystem(testWorld, nextId);

    const children = getEnemySnapshots(testWorld);
    expect(children.length).toBeGreaterThanOrEqual(2);
    expect(children.every((child) => child.name === "splitter")).toBe(true);
  });
});

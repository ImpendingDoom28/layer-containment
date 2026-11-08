import { beforeEach, describe, expect, it } from "vitest";

import { enemyActions } from "../actions/enemyActions";
import { IsEnemy, requestEnemyDeath } from "../traits/enemy";
import { splitRequest } from "../traits/split";
import { testWorld } from "../world";
import { useGameStore } from "../../stores/useGameStore";
import { useLevelStore } from "../../stores/useLevelStore";
import type { Enemy } from "../../types/game";
import {
  getSplitterDeathSquashScale,
  SPLITTER_DEATH_PREBURST_SECONDS,
} from "../../../constants/enemyLocomotion";

import { runEnemyDeathSystem } from "./enemyDeathSystem";

const baseEnemy = (id: number): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health: 10,
  maxHealth: 10,
  speed: 1,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0.2,
  pathIndex: 0,
  x: 1,
  z: 2,
  upgrades: [],
});

const splitterEnemy = (id: number): Enemy => ({
  ...baseEnemy(id),
  type: "splitter",
  split: { minChildren: 2, maxChildren: 4 },
});

describe("runEnemyDeathSystem", () => {
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
    for (const entity of testWorld.query(splitRequest)) entity.destroy();
    useGameStore.setState({ gameStatus: "playing" });
    useLevelStore.getState().resetLevelState();
  });

  it("settles a non-splitter death on the same pass", () => {
    const actions = enemyActions(testWorld);
    actions.spawnEnemy(baseEnemy(1));
    actions.damageEnemy(1, 10);

    runEnemyDeathSystem(testWorld, 5);

    expect(testWorld.query(IsEnemy).length).toBe(0);
    expect(testWorld.query(splitRequest).length).toBe(0);
  });

  it("holds a dead splitter back for the pre-burst window, then splits", () => {
    const actions = enemyActions(testWorld);
    actions.spawnEnemy(splitterEnemy(1));
    actions.damageEnemy(1, 10);

    // The killing blow stamps the request; the dead splitter lingers.
    runEnemyDeathSystem(testWorld, 10);
    expect(testWorld.query(IsEnemy, requestEnemyDeath).length).toBe(1);
    expect(testWorld.query(splitRequest).length).toBe(0);
    const stamped = testWorld
      .queryFirst(IsEnemy, requestEnemyDeath)
      ?.get(requestEnemyDeath);
    expect(stamped?.requestedAt).toBe(10);

    // Still inside the window: nothing settles.
    runEnemyDeathSystem(testWorld, 10 + SPLITTER_DEATH_PREBURST_SECONDS / 2);
    expect(testWorld.query(IsEnemy, requestEnemyDeath).length).toBe(1);
    expect(testWorld.query(splitRequest).length).toBe(0);

    // The window elapses: the split is raised and the parent removed.
    runEnemyDeathSystem(testWorld, 10 + SPLITTER_DEATH_PREBURST_SECONDS + 0.05);
    expect(testWorld.query(IsEnemy).length).toBe(0);
    expect(testWorld.query(splitRequest).length).toBe(1);
    const request = testWorld.queryFirst(splitRequest)?.get(splitRequest);
    expect(request?.x).toBe(1);
    expect(request?.z).toBe(2);
  });

  it("does not re-stamp a request that already has a timestamp", () => {
    const actions = enemyActions(testWorld);
    actions.spawnEnemy(splitterEnemy(1));
    actions.damageEnemy(1, 10);

    runEnemyDeathSystem(testWorld, 3);
    runEnemyDeathSystem(testWorld, 3 + SPLITTER_DEATH_PREBURST_SECONDS / 2);
    const stamped = testWorld
      .queryFirst(IsEnemy, requestEnemyDeath)
      ?.get(requestEnemyDeath);
    expect(stamped?.requestedAt).toBe(3);
  });
});

describe("getSplitterDeathSquashScale", () => {
  it("starts and stays within sane scale bounds", () => {
    const start = getSplitterDeathSquashScale(0);
    expect(start.y).toBeCloseTo(1);
    expect(start.xz).toBeCloseTo(1);

    for (let i = 0; i <= 20; i += 1) {
      const { y, xz } = getSplitterDeathSquashScale(i / 20);
      expect(y).toBeGreaterThan(0.5);
      expect(y).toBeLessThan(1.5);
      expect(xz).toBeGreaterThan(0.5);
      expect(xz).toBeLessThan(1.5);
    }
  });

  it("squashes down and wide mid-window, then stretches up at the end", () => {
    const mid = getSplitterDeathSquashScale(0.45);
    expect(mid.y).toBeLessThan(1);
    expect(mid.xz).toBeGreaterThan(1);

    const end = getSplitterDeathSquashScale(1);
    expect(end.y).toBeGreaterThan(1);
    expect(end.xz).toBeLessThan(1);
  });

  it("clamps out-of-range progress", () => {
    expect(getSplitterDeathSquashScale(-1)).toEqual(
      getSplitterDeathSquashScale(0)
    );
    expect(getSplitterDeathSquashScale(2)).toEqual(
      getSplitterDeathSquashScale(1)
    );
  });
});

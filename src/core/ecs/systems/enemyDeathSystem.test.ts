import { beforeEach, describe, expect, it } from "vitest";

import { enemyActions } from "../actions/enemyActions";
import { IsEnemy, requestEnemyDeath } from "../traits/enemy";
import { EnemyLocomotion } from "../traits/locomotion";
import { splitRequest } from "../traits/split";
import { testWorld } from "../world";
import { useGameStore } from "../../stores/useGameStore";
import { useLevelStore } from "../../stores/useLevelStore";
import type { Enemy } from "../../types/game";
import {
  ENEMY_LOCOMOTION,
  getDeathSquashScale,
  SPLITTER_DEATH_PREBURST_SECONDS,
  WRAITH_BOB_AMPLITUDE_RATIO,
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

  it("resolves the type's locomotion spec onto the entity at spawn", () => {
    const actions = enemyActions(testWorld);

    const wraith = actions.spawnEnemy({ ...baseEnemy(7), type: "fast" });
    const wraithLocomotion = wraith.get(EnemyLocomotion);
    expect(wraithLocomotion?.bobAmplitude).toBeCloseTo(
      0.4 * WRAITH_BOB_AMPLITUDE_RATIO
    );
    expect(wraithLocomotion?.walkAmplitude).toBe(0);
    expect(wraithLocomotion?.deathPreburstSeconds).toBe(0);

    const splitter = actions.spawnEnemy(splitterEnemy(8));
    const splitterLocomotion = splitter.get(EnemyLocomotion);
    expect(splitterLocomotion?.deathPreburstSeconds).toBe(
      SPLITTER_DEATH_PREBURST_SECONDS
    );
    expect(splitterLocomotion?.breathAmplitude).toBe(
      ENEMY_LOCOMOTION.splitter.breathAmplitude
    );

    const troop = actions.spawnEnemy(baseEnemy(9));
    const troopLocomotion = troop.get(EnemyLocomotion);
    expect(troopLocomotion?.bobAmplitude).toBe(0);
    expect(troopLocomotion?.walkAmplitude).toBe(
      ENEMY_LOCOMOTION.basic.walkAmplitude
    );
    expect(troopLocomotion?.walkFrequency).toBe(
      ENEMY_LOCOMOTION.basic.walkFrequency
    );
    expect(troopLocomotion?.breathAmplitude).toBe(0);
    expect(troopLocomotion?.deathPreburstSeconds).toBe(0);

    const medic = actions.spawnEnemy({ ...baseEnemy(10), type: "medic" });
    const medicLocomotion = medic.get(EnemyLocomotion);
    expect(medicLocomotion?.walkAmplitude).toBe(
      ENEMY_LOCOMOTION.medic.walkAmplitude
    );
    expect(medicLocomotion?.walkFrequency).toBe(
      ENEMY_LOCOMOTION.medic.walkFrequency
    );
    expect(medicLocomotion?.breathAmplitude).toBe(0);
    expect(medicLocomotion?.deathPreburstSeconds).toBe(0);
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

describe("getDeathSquashScale", () => {
  it("starts and stays within sane scale bounds", () => {
    const start = getDeathSquashScale(0);
    expect(start.y).toBeCloseTo(1);
    expect(start.xz).toBeCloseTo(1);

    for (let i = 0; i <= 20; i += 1) {
      const { y, xz } = getDeathSquashScale(i / 20);
      expect(y).toBeGreaterThan(0.5);
      expect(y).toBeLessThan(1.5);
      expect(xz).toBeGreaterThan(0.5);
      expect(xz).toBeLessThan(1.5);
    }
  });

  it("squashes down and wide mid-window, then stretches up at the end", () => {
    const mid = getDeathSquashScale(0.45);
    expect(mid.y).toBeLessThan(1);
    expect(mid.xz).toBeGreaterThan(1);

    const end = getDeathSquashScale(1);
    expect(end.y).toBeGreaterThan(1);
    expect(end.xz).toBeLessThan(1);
  });

  it("clamps out-of-range progress", () => {
    expect(getDeathSquashScale(-1)).toEqual(getDeathSquashScale(0));
    expect(getDeathSquashScale(2)).toEqual(getDeathSquashScale(1));
  });
});

import { describe, expect, it, beforeEach } from "vitest";

import { enemyActions } from "./enemyActions";
import { getEnemySnapshots } from "../selectors/enemySnapshots";
import { world } from "../world";
import type { Enemy } from "../../types/game";

const baseEnemy = (id: number, health: number): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health,
  maxHealth: 100,
  speed: 1,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  slowUntil: 0,
  slowMultiplier: 1,
  x: 0,
  z: 0,
  upgrades: [],
});

describe("enemyActions", () => {
  beforeEach(() => {
    enemyActions(world).clearAllEnemies();
  });

  it("spawnEnemy adds entity readable via snapshots", () => {
    enemyActions(world).spawnEnemy(baseEnemy(1, 100));
    const enemies = getEnemySnapshots(world);
    expect(enemies).toHaveLength(1);
    expect(enemies[0].health).toBe(100);
  });

  it("damageEnemy reduces health on sequential hits", () => {
    enemyActions(world).spawnEnemy(baseEnemy(1, 100));
    const actions = enemyActions(world);

    actions.damageEnemy(1, 10);
    expect(getEnemySnapshots(world)[0]?.health).toBe(90);

    actions.damageEnemy(1, 10);
    expect(getEnemySnapshots(world)[0]?.health).toBe(80);
  });

  it("removeEnemy destroys entity", () => {
    enemyActions(world).spawnEnemy(baseEnemy(1, 100));
    enemyActions(world).removeEnemy(1, false);
    expect(getEnemySnapshots(world)).toHaveLength(0);
  });
});

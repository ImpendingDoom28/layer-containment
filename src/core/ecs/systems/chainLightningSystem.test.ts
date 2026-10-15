import { beforeEach, describe, expect, it } from "vitest";

import { computeChainAdditionalHits } from "./chainLightningSystem";
import { enemyActions } from "../actions/enemyActions";
import { testWorld } from "../world";
import type { Enemy, Tower } from "../../types/game";

const mkTower = (): Tower => ({
  id: 1,
  type: "chain",
  name: "Chain",
  cost: 1,
  damage: 100,
  range: 10,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "chain",
  projectileSpeed: 10,
  color: "#fff",
  description: "",
  gridX: 0,
  gridZ: 0,
  x: 0,
  z: 0,
  lastFireTime: 0,
  maxChainHops: 3,
  chainDamageMultiplierPerHop: 0.85,
});

const makeEnemy = (id: number, x: number, z: number, health = 50): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health,
  maxHealth: health,
  speed: 1,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x,
  z,
  upgrades: [],
});

describe("computeChainAdditionalHits", () => {
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
  });

  it("chains up to 3 hops with 0.85 multiplier", () => {
    const first = makeEnemy(1, 2, 0);
    const second = makeEnemy(2, 4, 0);
    const third = makeEnemy(3, 6, 0);
    const fourth = makeEnemy(4, 8, 0);

    enemyActions(testWorld).spawnEnemy(first);
    enemyActions(testWorld).spawnEnemy(second);
    enemyActions(testWorld).spawnEnemy(third);
    enemyActions(testWorld).spawnEnemy(fourth);

    const hits = computeChainAdditionalHits(
      testWorld,
      mkTower(),
      first,
      100,
      10,
      3,
      0.85
    );

    expect(hits).toHaveLength(3);
    expect(hits[0].enemyId).toBe(2);
    expect(hits[0].damage).toBeCloseTo(85);
    expect(hits[1].damage).toBeCloseTo(85 * 0.85);
    expect(hits[2].damage).toBeCloseTo(85 * 0.85 * 0.85);
  });

  it("stops early when no next target in tower range", () => {
    const first = makeEnemy(1, 2, 0);
    const far = makeEnemy(2, 50, 0);

    enemyActions(testWorld).spawnEnemy(first);
    enemyActions(testWorld).spawnEnemy(far);

    const hits = computeChainAdditionalHits(
      testWorld,
      mkTower(),
      first,
      100,
      10,
      3,
      0.85
    );
    expect(hits).toHaveLength(0);
  });

  it("chains to an enemy outside tower range but within hop range of previous target", () => {
    const first = makeEnemy(1, 2, 0);
    const outsideTowerRing = makeEnemy(2, 11.5, 0);

    enemyActions(testWorld).spawnEnemy(first);
    enemyActions(testWorld).spawnEnemy(outsideTowerRing);

    const hits = computeChainAdditionalHits(
      testWorld,
      mkTower(),
      first,
      100,
      10,
      3,
      0.85
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].enemyId).toBe(2);
    expect(hits[0].damage).toBeCloseTo(85);
  });
});

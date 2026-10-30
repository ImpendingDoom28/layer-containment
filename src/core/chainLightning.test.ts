import { describe, expect, it } from "vitest";

import { computeChainAdditionalHits } from "./chainLightning";
import type { Enemy, Tower } from "./types/game";

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

const mkEnemy = (id: number, x: number, z: number, health = 50): Enemy => ({
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
  it("chains up to 3 hops with 0.85 multiplier", () => {
    const tower = mkTower();
    const first = mkEnemy(1, 2, 0);
    const second = mkEnemy(2, 4, 0);
    const third = mkEnemy(3, 6, 0);
    const fourth = mkEnemy(4, 8, 0);
    const enemies = [first, second, third, fourth];

    const hits = computeChainAdditionalHits(
      tower,
      enemies,
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
    const tower = mkTower();
    const first = mkEnemy(1, 2, 0);
    const far = mkEnemy(2, 50, 0);
    const hits = computeChainAdditionalHits(
      tower,
      [first, far],
      first,
      100,
      10,
      3,
      0.85
    );
    expect(hits).toHaveLength(0);
  });

  it("chains to an enemy outside tower range but within hop range of previous target", () => {
    const tower = mkTower();
    const first = mkEnemy(1, 2, 0);
    const outsideTowerRing = mkEnemy(2, 11.5, 0);
    const hits = computeChainAdditionalHits(
      tower,
      [first, outsideTowerRing],
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

  it("does not chain to an enemy hidden behind a building", () => {
    // The building at (4, 0) sits on both the tower→enemy and first→enemy
    // segments, so the hidden enemy must not be a hop candidate.
    const tower = mkTower();
    const first = mkEnemy(1, 2, 0);
    const hidden = mkEnemy(2, 6, 0);
    const building = { x: 4, z: 0, halfWidth: 0.4, halfDepth: 0.4 };
    const hits = computeChainAdditionalHits(
      tower,
      [first, hidden],
      first,
      100,
      10,
      3,
      0.85,
      [building]
    );
    expect(hits).toHaveLength(0);
  });

  it("still chains to visible enemies when an obstacle is off the chain line", () => {
    // The building at (4, 5) is off every chain segment, so the chain is
    // unaffected.
    const tower = mkTower();
    const first = mkEnemy(1, 2, 0);
    const second = mkEnemy(2, 4, 0);
    const building = { x: 4, z: 5, halfWidth: 0.4, halfDepth: 0.4 };
    const hits = computeChainAdditionalHits(
      tower,
      [first, second],
      first,
      100,
      10,
      3,
      0.85,
      [building]
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].enemyId).toBe(2);
  });
});

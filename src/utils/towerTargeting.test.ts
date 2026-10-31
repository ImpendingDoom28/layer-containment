import { describe, expect, it } from "vitest";

import type { Enemy, TowerTargeting } from "../core/types/game";

import { pickTowerTarget, TARGETING_STRATEGIES } from "./towerTargeting";

const makeEnemy = (
  id: number,
  x: number,
  z: number,
  health: number = 100
): Enemy => ({
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

const alwaysVisible = () => true;

const params = (range: number, lastTargetId?: number) => ({
  x: 0,
  z: 0,
  range,
  lastTargetId,
});

describe("pickTowerTarget", () => {
  it("returns null when no enemy is in range", () => {
    const enemies = [makeEnemy(1, 5, 0)];
    expect(pickTowerTarget(enemies, "nearest", params(2), alwaysVisible)).toBe(
      null
    );
  });

  it("ignores dead enemies", () => {
    const enemies = [makeEnemy(1, 1, 0, 0), makeEnemy(2, 2, 0, 50)];
    expect(
      pickTowerTarget(enemies, "nearest", params(5), alwaysVisible)
    ).toBe(enemies[1]);
  });

  it("ignores enemies without line of sight", () => {
    const enemies = [makeEnemy(1, 1, 0), makeEnemy(2, 2, 0)];
    const hidden = (enemy: Enemy) => enemy.id !== 1;
    expect(
      pickTowerTarget(enemies, "nearest", params(5), hidden)
    ).toBe(enemies[1]);
  });

  it('picks the nearest enemy for "nearest"', () => {
    const enemies = [makeEnemy(1, 2, 0), makeEnemy(2, 1, 0)];
    expect(
      pickTowerTarget(enemies, "nearest", params(5), alwaysVisible)
    ).toBe(enemies[1]);
  });

  it('picks the furthest enemy in range for "furthest"', () => {
    const enemies = [
      makeEnemy(1, 1, 0),
      makeEnemy(2, 4, 0),
      makeEnemy(3, 8, 0), // out of range
    ];
    expect(
      pickTowerTarget(enemies, "furthest", params(5), alwaysVisible)
    ).toBe(enemies[1]);
  });

  it('picks the lowest-health enemy in range for "lowest"', () => {
    const enemies = [
      makeEnemy(1, 1, 0, 90),
      makeEnemy(2, 2, 0, 10),
      makeEnemy(3, 3, 0, 50),
    ];
    expect(
      pickTowerTarget(enemies, "lowest", params(5), alwaysVisible)
    ).toBe(enemies[1]);
  });

  it('picks the highest-health enemy in range for "highest"', () => {
    const enemies = [
      makeEnemy(1, 1, 0, 90),
      makeEnemy(2, 2, 0, 10),
      makeEnemy(3, 3, 0, 50),
    ];
    expect(
      pickTowerTarget(enemies, "highest", params(5), alwaysVisible)
    ).toBe(enemies[0]);
  });

  it('keeps the last target for "focused" while it is alive, in range and visible', () => {
    const enemies = [makeEnemy(1, 1, 0), makeEnemy(2, 2, 0)];
    expect(
      pickTowerTarget(enemies, "focused", params(5, 1), alwaysVisible)
    ).toBe(enemies[0]);
  });

  it('falls back to the nearest for "focused" when the last target is gone', () => {
    const enemies = [makeEnemy(1, 3, 0, 0), makeEnemy(2, 1, 0)];
    expect(
      pickTowerTarget(enemies, "focused", params(5, 1), alwaysVisible)
    ).toBe(enemies[1]);
  });

  it('falls back to the nearest for "focused" when the last target left the range', () => {
    const enemies = [makeEnemy(1, 9, 0), makeEnemy(2, 1, 0)];
    expect(
      pickTowerTarget(enemies, "focused", params(5, 1), alwaysVisible)
    ).toBe(enemies[1]);
  });

  it('falls back to the nearest for "focused" when the last target is hidden', () => {
    const enemies = [makeEnemy(1, 1, 0), makeEnemy(2, 2, 0)];
    const hidden = (enemy: Enemy) => enemy.id !== 1;
    expect(pickTowerTarget(enemies, "focused", params(5, 1), hidden)).toBe(
      enemies[1]
    );
  });

  it('falls back to the nearest for "focused" with no previous target', () => {
    const enemies = [makeEnemy(1, 2, 0), makeEnemy(2, 1, 0)];
    expect(
      pickTowerTarget(enemies, "focused", params(5), alwaysVisible)
    ).toBe(enemies[1]);
  });

  it("exposes the full strategy list in selector order", () => {
    expect([...TARGETING_STRATEGIES]).toEqual([
      "nearest",
      "furthest",
      "lowest",
      "highest",
      "focused",
    ]);
  });

  it.each(["nearest", "focused"] as const)(
    "returns null for %s when all candidates are out of range",
    (strategy: TowerTargeting) => {
      const enemies = [makeEnemy(1, 9, 0)];
      expect(
        pickTowerTarget(enemies, strategy, params(2), alwaysVisible)
      ).toBe(null);
    }
  );
});

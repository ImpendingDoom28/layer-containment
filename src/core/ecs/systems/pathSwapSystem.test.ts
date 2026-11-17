import { beforeEach, describe, expect, it } from "vitest";

import { getPositionAlongMultiplePaths } from "../../../utils/pathUtils";
import { runPathSwapSystem } from "./pathSwapSystem";
import { enemyActions } from "../actions/enemyActions";
import { EnemyMotion, EnemyState } from "../traits/enemy";
import { spawnEffectRequest } from "../traits/effect";
import { PathSwap } from "../traits/pathSwap";
import { testWorld } from "../world";
import type { Enemy, PathWaypoint } from "../../../core/types/game";

// The two approaches (Sector 2's layout): same z rows, x mirrored. Path A is
// 33 world units long, path B 34 (the merge at x = -0.5 makes the right
// approach one tile longer), so the same progress fraction lands on the same z
// row on both paths (approximately) — the swap target for the Ferryman boss.
const pathA: PathWaypoint[] = [
  { x: -6.5, y: 0, z: -9.5 },
  { x: -6.5, y: 0, z: -5.5 },
  { x: -2.5, y: 0, z: -5.5 },
  { x: -2.5, y: 0, z: -1.5 },
  { x: -6.5, y: 0, z: -1.5 },
  { x: -6.5, y: 0, z: 2.5 },
  { x: -0.5, y: 0, z: 2.5 },
  { x: -0.5, y: 0, z: 6.5 },
  { x: -0.5, y: 0, z: 9.5 },
];
const pathB: PathWaypoint[] = [
  { x: 6.5, y: 0, z: -9.5 },
  { x: 6.5, y: 0, z: -5.5 },
  { x: 2.5, y: 0, z: -5.5 },
  { x: 2.5, y: 0, z: -1.5 },
  { x: 6.5, y: 0, z: -1.5 },
  { x: 6.5, y: 0, z: 2.5 },
  { x: -0.5, y: 0, z: 2.5 },
  { x: -0.5, y: 0, z: 6.5 },
  { x: -0.5, y: 0, z: 9.5 },
];
const pathWaypoints = [pathA, pathB];
// The z = -1.5 row is at 12/33 ≈ 0.3636 of the path (pre-merge approach).
const SWAP_PROGRESS = 12 / 33;

const makeEnemy = (id: number, overrides: Partial<Enemy> = {}): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health: 100,
  maxHealth: 100,
  speed: 1,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x: 0,
  z: 0,
  upgrades: [],
  ...overrides,
});

const run = () => runPathSwapSystem(testWorld, { pathWaypoints, radius: 50 });

describe("pathSwapSystem", () => {
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
    for (const entity of [...testWorld.query(spawnEffectRequest)]) {
      entity.destroy();
    }
  });

  const spawnWithSwap = (
    progress: number,
    pathIndex = 0,
    swaps: { atProgress: number; targetPathIndex: number }[] = [
      { atProgress: SWAP_PROGRESS, targetPathIndex: 1 },
    ]
  ) => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { pathProgress: progress, pathIndex })
    );
    entity.add(PathSwap({ swaps, nextSwap: 0 }));
    return entity;
  };

  it("fires a pending rule when progress crosses the threshold, keeping progress", () => {
    const entity = spawnWithSwap(SWAP_PROGRESS + 0.001);
    run();

    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    // The enemy keeps its progress, so it sits on the other front's lane.
    expect(entity.get(EnemyMotion)!.pathProgress).toBeCloseTo(SWAP_PROGRESS);
    const mirrored = getPositionAlongMultiplePaths(
      pathWaypoints,
      1,
      SWAP_PROGRESS
    );
    // Path A at 12/33 is the inner lane on the z = -1.5 row; the same
    // fraction on path B is the (slightly non-mirror, the paths are 33 vs 34
    // long) counterpart on the same row — a valid position on the other front.
    expect(mirrored.z).toBeCloseTo(-1.5);
    expect(mirrored.x).toBeCloseTo(2.86, 1);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("does not fire before the threshold", () => {
    const entity = spawnWithSwap(SWAP_PROGRESS - 0.05);
    run();

    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.has(PathSwap)).toBe(true);
  });

  it("fires once and does not re-fire on later passes", () => {
    const entity = spawnWithSwap(SWAP_PROGRESS + 0.001);
    run();
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    expect(entity.has(PathSwap)).toBe(false);

    // A later pass (enemy has moved on) must not touch the path again.
    run();
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
  });

  it("applies multiple rules in order as progress advances", () => {
    const swaps = [
      { atProgress: 0.36, targetPathIndex: 1 },
      { atProgress: 0.4, targetPathIndex: 0 },
    ];

    // Past only the first rule: it fires, the second stays pending.
    let entity = spawnWithSwap(0.38, 0, swaps);
    run();
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    expect(entity.has(PathSwap)).toBe(true);

    // Past both rules: the second fires (back to path 0) and the ability is
    // consumed.
    enemyActions(testWorld).clearAllEnemies();
    entity = spawnWithSwap(0.45, 0, swaps);
    run();
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("drops the ability when the enemy reaches the path end", () => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { pathProgress: 1 })
    );
    entity.add(
      PathSwap({
        swaps: [{ atProgress: 0.5, targetPathIndex: 1 }],
        nextSwap: 0,
      })
    );

    run();
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("consumes an invalid target rule without re-assigning", () => {
    const swaps = [
      { atProgress: 0.4, targetPathIndex: 5 }, // no such path
      { atProgress: 0.6, targetPathIndex: 1 },
    ];

    // Past only the (invalid) first rule: it is consumed, the path is
    // unchanged, and the ability remains (the second rule is still pending).
    let entity = spawnWithSwap(0.5, 0, swaps);
    run();
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.has(PathSwap)).toBe(true);

    // Past both rules: the second (valid) rule fires.
    enemyActions(testWorld).clearAllEnemies();
    entity = spawnWithSwap(0.65, 0, swaps);
    run();
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("raises a spawn burst at the new position", () => {
    spawnWithSwap(SWAP_PROGRESS + 0.001);
    run();

    const requests = [...testWorld.query(spawnEffectRequest)];
    expect(requests).toHaveLength(1);
    expect(requests[0]!.get(spawnEffectRequest)!.type).toBe("spawn");
  });

  it("leaves enemies without the trait alone", () => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { pathProgress: SWAP_PROGRESS + 0.001 })
    );
    run();
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
  });
});

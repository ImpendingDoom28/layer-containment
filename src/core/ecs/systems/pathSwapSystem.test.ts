import { beforeEach, describe, expect, it } from "vitest";

import { getPositionAlongMultiplePaths } from "../../../utils/pathUtils";
import { runPathSwapSystem } from "./pathSwapSystem";
import { enemyActions } from "../actions/enemyActions";
import { EnemyMotion, EnemyState } from "../traits/enemy";
import { PathSwap } from "../traits/pathSwap";
import { Position } from "../traits/position";
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
// The telegraph wind-up (the enemy stands still this long before the jump).
const TELEGRAPH = 1;
// The arrival burst (the trait lingers this long after a cross so the landing
// visual can play even for the final cross).
const ARRIVAL = 0.45;

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

const run = (time: number) =>
  runPathSwapSystem(testWorld, {
    pathWaypoints,
    simulationTimeSeconds: time,
  });

describe("pathSwapSystem", () => {
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
  });

  const spawnWithSwap = (
    progress: number,
    pathIndex = 0,
    swaps: { atProgress: number; targetPathIndex: number }[] = [
      { atProgress: SWAP_PROGRESS, targetPathIndex: 1 },
    ]
  ) => {
    // Spawn at the enemy's real path position so the initial Position trait
    // (seeded from x/z) matches where the enemy is on its route.
    const point = getPositionAlongMultiplePaths(pathWaypoints, pathIndex, progress);
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { pathProgress: progress, pathIndex, x: point.x, z: point.z })
    );
    entity.add(
      PathSwap({ swaps, nextSwap: 0, telegraphReadyAt: 0, lastCrossAt: 0 })
    );
    return entity;
  };

  it("telegraphs, holds, then jumps when the threshold is crossed", () => {
    const entity = spawnWithSwap(SWAP_PROGRESS + 0.001);

    // Threshold crossed: the telegraph opens (no jump yet) and the wind-up
    // is scheduled one simulation second ahead.
    run(0);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.has(PathSwap)).toBe(true);
    expect(entity.get(PathSwap)!.telegraphReadyAt).toBeCloseTo(TELEGRAPH);

    // Mid-telegraph: the enemy still holds its ground.
    run(0.5);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.has(PathSwap)).toBe(true);

    // The telegraph is up: the cross fires, keeping the progress.
    run(TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    expect(entity.get(EnemyMotion)!.pathProgress).toBeCloseTo(SWAP_PROGRESS);
    expect(entity.get(PathSwap)!.lastCrossAt).toBeCloseTo(TELEGRAPH);
    const landed = getPositionAlongMultiplePaths(pathWaypoints, 1, SWAP_PROGRESS);
    // Path A at 12/33 is the inner lane on the z = -1.5 row; the same fraction
    // on path B is the counterpart on the same row — a valid position on the
    // other front.
    expect(landed.z).toBeCloseTo(-1.5);
    expect(landed.x).toBeCloseTo(2.86, 1);
    // The trait lingers for the arrival burst: all rules are consumed but the
    // ability is not dropped until the burst window elapses.
    expect(entity.get(PathSwap)!.nextSwap).toBe(entity.get(PathSwap)!.swaps.length);
    expect(entity.has(PathSwap)).toBe(true);
    // Once the burst window elapses the trait is dropped (koota flushes the
    // removal after the pass, so it is gone by the following pass).
    run(TELEGRAPH + ARRIVAL);
    run(TELEGRAPH + ARRIVAL + 0.1);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("does not open a telegraph before the threshold", () => {
    const entity = spawnWithSwap(SWAP_PROGRESS - 0.05);

    run(0);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.has(PathSwap)).toBe(true);
    expect(entity.get(PathSwap)!.telegraphReadyAt).toBe(0);

    run(0.5);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.get(PathSwap)!.telegraphReadyAt).toBe(0);
  });

  it("does not re-fire once the cross is done", () => {
    const entity = spawnWithSwap(SWAP_PROGRESS + 0.001);
    run(0);
    run(TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    expect(entity.has(PathSwap)).toBe(true); // lingering for the arrival burst

    // A later pass (enemy has moved on) must not touch the path again; once
    // the arrival window elapses the trait is dropped (gone by the following
    // pass, since koota flushes removals after the pass).
    run(TELEGRAPH + 0.5);
    run(TELEGRAPH + 0.6);
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("opens the next telegraph only once its threshold is reached", () => {
    const swaps = [
      { atProgress: 0.36, targetPathIndex: 1 },
      { atProgress: 0.4, targetPathIndex: 0 },
    ];

    // Past only the first rule: it is telegraphed, then jumped to. The second
    // rule (0.4) is not yet reached, so no second telegraph opens.
    let entity = spawnWithSwap(0.38, 0, swaps);
    run(0);
    expect(entity.get(PathSwap)!.telegraphReadyAt).toBeCloseTo(TELEGRAPH);
    run(TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    expect(entity.has(PathSwap)).toBe(true);
    expect(entity.get(PathSwap)!.telegraphReadyAt).toBe(0);
  });

  it("telegraphs and performs both crosses when both are due", () => {
    const swaps = [
      { atProgress: 0.36, targetPathIndex: 1 },
      { atProgress: 0.4, targetPathIndex: 0 },
    ];

    // Past both rules: the first is telegraphed, jumped to, and (already past
    // the second threshold) the second is telegraphed right away.
    const entity = spawnWithSwap(0.45, 0, swaps);
    run(0);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.get(PathSwap)!.telegraphReadyAt).toBeCloseTo(TELEGRAPH);

    run(TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    expect(entity.has(PathSwap)).toBe(true);
    expect(entity.get(PathSwap)!.telegraphReadyAt).toBeCloseTo(2 * TELEGRAPH);

    run(2 * TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    // The final cross leaves the trait lingering for the arrival burst; once
    // the window elapses the trait is dropped (gone by the following pass,
    // since koota flushes removals after the pass).
    expect(entity.has(PathSwap)).toBe(true);
    run(2 * TELEGRAPH + ARRIVAL);
    run(2 * TELEGRAPH + ARRIVAL + 0.1);
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
        telegraphReadyAt: 0,
        lastCrossAt: 0,
      })
    );

    run(0);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("consumes an invalid target rule without re-assigning", () => {
    const swaps = [
      { atProgress: 0.4, targetPathIndex: 5 }, // no such path
      { atProgress: 0.6, targetPathIndex: 1 },
    ];

    // Past the (invalid) first rule: it is telegraphed, then consumed on the
    // jump without moving the enemy.
    let entity = spawnWithSwap(0.5, 0, swaps);
    run(0);
    expect(entity.get(PathSwap)!.telegraphReadyAt).toBeCloseTo(TELEGRAPH);
    run(TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    expect(entity.has(PathSwap)).toBe(true);
    expect(entity.get(PathSwap)!.telegraphReadyAt).toBe(0);

    // Past both rules: the second (valid) rule fires after its own telegraph
    // (the first, invalid, rule is consumed on its jump without moving).
    enemyActions(testWorld).clearAllEnemies();
    entity = spawnWithSwap(0.65, 0, swaps);
    run(0);
    run(TELEGRAPH);
    run(2 * TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    // The final cross leaves the trait lingering for the arrival burst; once
    // the window elapses the trait is dropped (gone by the following pass,
    // since koota flushes removals after the pass).
    expect(entity.has(PathSwap)).toBe(true);
    run(2 * TELEGRAPH + ARRIVAL);
    run(2 * TELEGRAPH + ARRIVAL + 0.1);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("re-places the enemy on the new path the moment it jumps (chained telegraph)", () => {
    const swaps = [
      { atProgress: 0.36, targetPathIndex: 1 },
      { atProgress: 0.361, targetPathIndex: 0 },
    ];

    // Both rules are already due: the first is telegraphed, jumped to, and the
    // second is telegraphed on the same pass — so the movement pass then skips
    // the frozen enemy and would never re-place it. The jump itself must.
    const entity = spawnWithSwap(0.45, 0, swaps);
    run(0);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    // Still on path A (the outer left lane, x = -6.5) while the first
    // telegraph is up.
    const onA = getPositionAlongMultiplePaths(pathWaypoints, 0, 0.45);
    expect(entity.get(Position)!.x).toBeCloseTo(onA.x, 2);

    // After the first jump the enemy is visibly on path B (the arrival point),
    // even though the second telegraph is already freezing it.
    run(TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    const onB = getPositionAlongMultiplePaths(pathWaypoints, 1, 0.45);
    expect(entity.get(Position)!.x).toBeCloseTo(onB.x, 2);
    expect(entity.get(Position)!.z).toBeCloseTo(onB.z, 2);

    run(2 * TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
    // The final cross leaves the trait lingering for the arrival burst; once
    // the window elapses the trait is dropped (gone by the following pass,
    // since koota flushes removals after the pass).
    expect(entity.has(PathSwap)).toBe(true);
    run(2 * TELEGRAPH + ARRIVAL);
    run(2 * TELEGRAPH + ARRIVAL + 0.1);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("leaves enemies without the trait alone", () => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { pathProgress: SWAP_PROGRESS + 0.001 })
    );
    run(0);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
  });
});

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
// The telegraph wind-up (the enemy stands still this long before the jump).
const TELEGRAPH = 1;

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
  runPathSwapSystem(testWorld, { pathWaypoints, radius: 50, simulationTimeSeconds: time });

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
    entity.add(PathSwap({ swaps, nextSwap: 0, telegraphReadyAt: 0 }));
    return entity;
  };

  it("telegraphs, holds, then jumps when the threshold is crossed", () => {
    const entity = spawnWithSwap(SWAP_PROGRESS + 0.001);

    // Threshold crossed: the telegraph opens (no jump yet) and a wind-up ring
    // plays at the standing position.
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
    const landed = getPositionAlongMultiplePaths(pathWaypoints, 1, SWAP_PROGRESS);
    // Path A at 12/33 is the inner lane on the z = -1.5 row; the same fraction
    // on path B is the (slightly non-mirror, the paths are 33 vs 34 long)
    // counterpart on the same row — a valid position on the other front.
    expect(landed.z).toBeCloseTo(-1.5);
    expect(landed.x).toBeCloseTo(2.86, 1);
    // One-shot: the ability is consumed.
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
    expect(entity.has(PathSwap)).toBe(false);

    // A later pass (enemy has moved on) must not touch the path again.
    run(TELEGRAPH + 0.5);
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
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

    // Past both rules: the second (valid) rule fires after its own telegraph.
    enemyActions(testWorld).clearAllEnemies();
    entity = spawnWithSwap(0.65, 0, swaps);
    run(0);
    run(TELEGRAPH);
    run(2 * TELEGRAPH);
    expect(entity.get(EnemyState)!.pathIndex).toBe(1);
    expect(entity.has(PathSwap)).toBe(false);
  });

  it("plays a wind-up ring while standing and an arrival ring after the jump", () => {
    spawnWithSwap(SWAP_PROGRESS + 0.001);

    // Telegraph ring: a 1s "spawn" burst at the standing position.
    run(0);
    let requests = [...testWorld.query(spawnEffectRequest)];
    expect(requests).toHaveLength(1);
    expect(requests[0]!.get(spawnEffectRequest)!.type).toBe("spawn");
    expect(requests[0]!.get(spawnEffectRequest)!.duration).toBeCloseTo(TELEGRAPH);

    // Arrival ring: a second "spawn" burst at the new position.
    run(TELEGRAPH);
    requests = [...testWorld.query(spawnEffectRequest)];
    expect(requests).toHaveLength(2);
    const arrival = requests[1]!.get(spawnEffectRequest)!;
    expect(arrival.type).toBe("spawn");
    expect(arrival.duration).toBe(0); // default (per-type) arrival length
  });

  it("leaves enemies without the trait alone", () => {
    const entity = enemyActions(testWorld).spawnEnemy(
      makeEnemy(1, { pathProgress: SWAP_PROGRESS + 0.001 })
    );
    run(0);
    expect(entity.get(EnemyState)!.pathIndex).toBe(0);
  });
});

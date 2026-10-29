import type { World } from "koota";
import { Vector3 } from "three";

import { EnemyMotion, EnemyState } from "../traits/enemy";
import { EnemySlow } from "../traits/slow";
import { Position } from "../traits/position";
import { effectActions } from "../actions/effectActions";
import {
  getPathLength,
  getPositionAlongMultiplePaths,
  isAtPathEnd,
} from "../../../utils/pathUtils";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
} from "../../../utils/planetSurfaceMapping";
import type { PathWaypoint } from "../../types/game";
import { useLevelStore } from "../../stores/useLevelStore";
import { useGameStore } from "../../stores/useGameStore";

/**
 * Regeneration is applied as discrete ticks (<= 10 per second) instead of
 * every frame. A health write is a cold-trait change event, so ticking at
 * 10 Hz keeps per-frame work off the hottest path while the health bar
 * stays visually smooth.
 */
const REGEN_TICK_INTERVAL = 0.1;

// Module-level scratch vectors: a single world, single system instance,
// so they are safe to share.
const scratchSurface = new Vector3();
const scratchNormal = new Vector3();
const scratchEndPos = new Vector3();

export type EnemyMovementSystemOptions = {
  pathWaypoints: PathWaypoint[][];
  radius: number;
  /**
   * Called once when an enemy reaches the end of its path. May be null
   * (main menu scene): the enemy then stays at the end of the path.
   */
  onEnemyReachEnd: ((enemyId: number) => void) | null;
  /**
   * When false, enemies clamped at the path end do not settle the end
   * (effect + removal) yet — they finish it on the first frame where it
   * is true again (resume). Defaults to true.
   */
  canFinish?: boolean;
};

/**
 * Advances all enemies along their paths in a single batched pass.
 *
 * `pathProgress` is a fraction of the enemy's own path, so progress advances
 * by `speed / pathLength` per second — a constant world-space speed
 * regardless of how long the path (or its waypoint gaps) are. (Previously
 * the fraction advanced by a fixed divisor of speed, making enemies move
 * faster in world units on longer paths.)
 *
 * Writes only `EnemyMotion` (hot, unsubscribed by React) per frame; the
 * cold `EnemyState` is written by other systems on discrete events (regen
 * ticks here) and the standalone `EnemySlow` by the ApplySlowSystem.
 * Reaching the end of the path is collected and settled after the query
 * pass so entities are never destroyed mid-iteration.
 */
export const runEnemyMovementSystem = (
  world: World,
  delta: number,
  effectiveTime: number,
  options: EnemyMovementSystemOptions
): void => {
  if (delta <= 0) return;

  const { pathWaypoints, radius, onEnemyReachEnd, canFinish = true } = options;
  const reachedEndIds: number[] = [];

  world
    .query(EnemyState, EnemyMotion, Position)
    .updateEach(([state, motion, position], entity) => {
      if (state.health <= 0) return;

      // Reads the slow state written by the ApplySlowSystem (which runs
      // first in the frame). The enemy carries the EnemySlow trait only while
      // a slow is in effect, so absence means full speed. `until > effectiveTime`
      // (effectiveTime >= 0) already implies the slow is not expired.
      const slow = entity.get(EnemySlow);
      const effectiveSpeed =
        slow && slow.until > effectiveTime && slow.multiplier < 1
          ? state.speed * slow.multiplier
          : state.speed;

      const path = pathWaypoints[state.pathIndex];
      const pathLength = path ? getPathLength(path) : 0;
      if (pathLength > 0) {
        motion.pathProgress += (effectiveSpeed * delta) / pathLength;
      }

      if (isAtPathEnd(motion.pathProgress)) {
        // Clamp the motion to the path end. The hasReachedEnd flag (hot
        // trait) guards the one-shot end effect and removal against
        // re-firing every frame — mirroring the old per-entity ref.
        const endPos = getPositionAlongMultiplePaths(
          pathWaypoints,
          state.pathIndex,
          1
        );
        motion.pathProgress = 1;
        position.x = endPos.x;
        position.y = endPos.y;
        position.z = endPos.z;

        // Deferred end while paused: the enemy is clamped but the end
        // (effect + base damage) settles on the first resumable frame.
        if (!canFinish || motion.hasReachedEnd) return;

        motion.hasReachedEnd = true;

        flatFieldToSphereSurface(
          endPos.x,
          endPos.z,
          radius,
          scratchSurface,
          scratchNormal
        );
        scratchEndPos
          .copy(scratchSurface)
          .addScaledVector(scratchNormal, endPos.y + 0.1);
        effectActions(world).requestSpawnEffect(
          [scratchEndPos.x, scratchEndPos.y, scratchEndPos.z],
          state.color,
          "end"
        );

        if (onEnemyReachEnd) {
          reachedEndIds.push(state.id);
        }
        return;
      }

      const waypoint = getPositionAlongMultiplePaths(
        pathWaypoints,
        state.pathIndex,
        motion.pathProgress
      );
      position.x = waypoint.x;
      position.y = waypoint.y;
      position.z = waypoint.z;

      // Regeneration: discrete ticks on the cold trait. The first pass
      // (lastRegenTick = -1) only establishes the baseline at the current
      // simulation time — no healing for time before the enemy spawned.
      if (
        state.regeneration &&
        state.regeneration > 0 &&
        state.health < state.maxHealth
      ) {
        if (motion.lastRegenTick < 0) {
          motion.lastRegenTick = effectiveTime;
        } else {
          const elapsed = effectiveTime - motion.lastRegenTick;
          if (elapsed >= REGEN_TICK_INTERVAL) {
            motion.lastRegenTick = effectiveTime;
            const healAmount = state.regeneration * elapsed;
            state.health = Math.min(state.maxHealth, state.health + healAmount);
          }
        }
      }
    });

  for (const id of reachedEndIds) {
    onEnemyReachEnd?.(id);
  }
};

/**
 * Frame-loop wrapper: reads level geometry from the stores once per frame
 * and runs the batched movement pass.
 */
export const runEnemyMovementFrame = (
  world: World,
  state: { clock: { elapsedTime: number } },
  delta: number,
  getSimulationTime: (rawNow: number) => number,
  callbacks: Pick<EnemyMovementSystemOptions, "onEnemyReachEnd" | "canFinish">
): void => {
  const { pathWaypoints, gridSize } = useLevelStore.getState();
  const { tileSize } = useGameStore.getState();
  const radius = getPlanetRadius(gridSize, tileSize);

  runEnemyMovementSystem(
    world,
    delta,
    getSimulationTime(state.clock.elapsedTime),
    {
      pathWaypoints,
      radius,
      onEnemyReachEnd: callbacks.onEnemyReachEnd,
      canFinish: callbacks.canFinish,
    }
  );
};

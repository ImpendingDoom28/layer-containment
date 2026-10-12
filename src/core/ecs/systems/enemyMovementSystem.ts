import type { World } from "koota";
import { Vector3 } from "three";

import { EnemyMotion, EnemyState } from "../traits/enemy";
import {
  isAtPathEnd,
  getPositionAlongMultiplePaths,
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

/** Path progress divisor shared with the pre-existing movement math. */
const PATH_PROGRESS_DIVISOR = 20;

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
  onEndEffect: ((position: [number, number, number], color: string) => void) | null;
};

/**
 * Advances all enemies along their paths in a single batched pass.
 *
 * Writes only `EnemyMotion` (hot, unsubscribed by React) per frame; the
 * cold `EnemyState` is written on discrete events (slow expiry, regen tick).
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

  const { pathWaypoints, radius, onEnemyReachEnd, onEndEffect } = options;
  const reachedEndIds: number[] = [];

  world.query(EnemyState, EnemyMotion).updateEach(([state, motion]) => {
      if (state.health <= 0) return;

      // Slow expiry mirrors the previous per-component logic: the slow is
      // cleared, and the enemy keeps moving this frame at full speed.
      // (In-place write: entity.set on a trait being iterated by updateEach
      // is dropped by koota, while in-place mutation persists and fires the
      // trait's change event.)
      const currentlySlowed =
        state.slowUntil > 0 &&
        state.slowUntil > effectiveTime &&
        state.slowMultiplier < 1;
      if (!currentlySlowed && state.slowMultiplier < 1) {
        state.slowMultiplier = 1;
        state.slowUntil = 0;
      }

      const effectiveSpeed = currentlySlowed
        ? state.speed * state.slowMultiplier
        : state.speed;

      const progressDelta = (effectiveSpeed * delta) / PATH_PROGRESS_DIVISOR;
      motion.pathProgress += progressDelta;

      if (isAtPathEnd(motion.pathProgress)) {
        // Clamp the motion to the path end. The hasReachedEnd flag (hot
        // trait) guards the one-shot end effect and removal against
        // re-firing every frame — mirroring the old per-entity ref.
        const endPos = getPositionAlongMultiplePaths(
          pathWaypoints,
          state.pathIndex,
          1
        );
        motion.pathProgress = Math.max(motion.pathProgress, 1);
        motion.x = endPos.x;
        motion.y = endPos.y;
        motion.z = endPos.z;

        if (!motion.hasReachedEnd) {
          motion.hasReachedEnd = true;

          if (onEndEffect) {
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
            onEndEffect([scratchEndPos.x, scratchEndPos.y, scratchEndPos.z], state.color);
          }

          if (onEnemyReachEnd) {
            reachedEndIds.push(state.id);
          }
        }
        return;
      }

      const position = getPositionAlongMultiplePaths(
        pathWaypoints,
        state.pathIndex,
        motion.pathProgress
      );
      motion.x = position.x;
      motion.y = position.y;
      motion.z = position.z;

      // Regeneration: discrete ticks on the cold trait.
      if (
        state.regeneration &&
        state.regeneration > 0 &&
        state.health < state.maxHealth
      ) {
        const elapsed = effectiveTime - motion.lastRegenTick;
        if (elapsed >= REGEN_TICK_INTERVAL) {
          motion.lastRegenTick = effectiveTime;
          const healAmount = state.regeneration * elapsed;
          state.health = Math.min(state.maxHealth, state.health + healAmount);
        }
      }
    }
  );

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
  callbacks: Pick<EnemyMovementSystemOptions, "onEnemyReachEnd" | "onEndEffect">
): void => {
  const { pathWaypoints, gridSize } = useLevelStore.getState();
  const { tileSize } = useGameStore.getState();
  const radius = getPlanetRadius(gridSize, tileSize);

  runEnemyMovementSystem(world, delta, getSimulationTime(state.clock.elapsedTime), {
    pathWaypoints,
    radius,
    onEnemyReachEnd: callbacks.onEnemyReachEnd,
    onEndEffect: callbacks.onEndEffect,
  });
};

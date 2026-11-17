import type { World } from "koota";
import { Vector3 } from "three";

import { flatFieldToSphereSurface } from "../../../utils/planetSurfaceMapping";
import { getPositionAlongMultiplePaths } from "../../../utils/pathUtils";
import type { PathWaypoint } from "../../types/game";
import { effectActions } from "../actions/effectActions";
import { EnemyMotion, EnemyState } from "../traits/enemy";
import { PathSwap } from "../traits/pathSwap";

// Module-level scratch vectors: a single world, single system instance, so
// they are safe to share (mirrors the enemy movement system).
const scratchSurface = new Vector3();
const scratchNormal = new Vector3();
const scratchPos = new Vector3();

/**
 * How long (in simulation seconds) an enemy stands in place, telegraphed,
 * before the pending cross fires. The telegraph ring lasts this long, so the
 * ring's disappearance coincides with the jump.
 */
const TELEGRAPH_SECONDS = 1;

export type PathSwapSystemOptions = {
  pathWaypoints: PathWaypoint[][];
  /** Planet radius, used to convert a swap position to a surface effect. */
  radius: number;
  /**
   * Current simulation time (the pause-adjusted clock the movement system
   * uses). The telegraph countdown runs on it, so a telegraph in flight
   * pauses with the game.
   */
  simulationTimeSeconds: number;
};

/**
 * Applies the generic `PathSwap` ability: as an enemy's `pathProgress` crosses
 * each rule's `atProgress` (in order), it is re-assigned onto the rule's
 * `targetPathIndex` while **keeping its current `pathProgress`**.
 *
 * This is a generic enemy ability, not boss-specific — any enemy carrying the
 * `PathSwap` trait can use it. The Sector 2 "Ferryman" boss uses it to flip
 * front between the two portal approaches: the approaches are mirror-symmetric
 * (identical z rows, x mirrored), so the same `pathProgress` lands the boss on
 * the mirrored lane of the other path — a clean cross that never pops it into
 * water or a building. For non-symmetric layouts the same progress fraction
 * simply places the enemy on the corresponding point of the other route, which
 * is still a valid position on a real path.
 *
 * Each cross is telegraphed: when a rule becomes due the system sets
 * `telegraphReadyAt` one simulation second ahead and raises a "spawn" ring
 * burst at the enemy's standing position. Until then the enemy **stands
 * still** (the movement system skips advancing it while
 * `telegraphReadyAt > simulationTimeSeconds`), so the player sees the cross
 * coming and knows exactly when it will happen. When the timestamp arrives the
 * cross is performed and an arrival burst plays at the new position. If the
 * next rule is already due at that moment (or was skipped past by a large
 * frame step), it is telegraphed right away; otherwise the enemy resumes
 * walking until that rule's threshold.
 *
 * The movement system derives the enemy's `Position` and `FacingDirection`
 * from `(pathIndex, pathProgress)` every frame, so the cross only rewrites
 * `pathIndex`; the enemy is on the new route when it moves (the system runs
 * just before the movement pass).
 *
 * Each rule fires at most once; the trait is removed as soon as the last rule
 * is consumed (or the enemy reaches the path end), so the ability is one-shot
 * per rule and a re-spawned enemy does not inherit it. `EnemyState`/
 * `EnemyMotion` are read (not iterated) here, so their in-place writes are not
 * dropped by koota's "no writes on an iterated trait" rule; `PathSwap` is the
 * iterated trait and is removed when done (the same pattern the slow system
 * uses to consume its request).
 */
export const runPathSwapSystem = (
  world: World,
  options: PathSwapSystemOptions
): void => {
  const { pathWaypoints, radius, simulationTimeSeconds } = options;

  world.query(PathSwap).updateEach(([swap], entity) => {
    const state = entity.get(EnemyState);
    const motion = entity.get(EnemyMotion);
    if (!state || !motion) return;
    if (state.health <= 0) {
      entity.remove(PathSwap);
      return;
    }

    // No rules left (including an empty list): drop the ability.
    if (swap.nextSwap >= swap.swaps.length) {
      entity.remove(PathSwap);
      return;
    }

    // At the path end no further cross is possible: drop the ability.
    if (motion.pathProgress >= 1) {
      entity.remove(PathSwap);
      return;
    }

    // A telegraph is in flight: when its timestamp is reached, perform the
    // pending cross. (Not yet reached, the enemy holds its ground — the
    // movement system skips it this frame — and this pass only counts down.)
    if (swap.telegraphReadyAt > 0) {
      if (simulationTimeSeconds < swap.telegraphReadyAt) return;

      const rule = swap.swaps[swap.nextSwap];
      const targetPathIndex = rule.targetPathIndex;
      const valid =
        targetPathIndex >= 0 &&
        targetPathIndex < pathWaypoints.length &&
        targetPathIndex !== state.pathIndex;

      // Consume the rule; the telegraph is spent either way. An invalid or
      // no-op re-assignment (a target equal to the current path, e.g.
      // post-merge) is skipped without moving.
      swap.nextSwap += 1;
      swap.telegraphReadyAt = 0;

      if (valid) {
        // Re-assign to the target path, keeping the current progress
        // fraction. On mirror-symmetric approaches this is the mirrored
        // position.
        state.pathIndex = targetPathIndex;
        // Raise an arrival burst at the new position (flat field → planet
        // surface) so the landing reads as a short teleport.
        requestSwapBurst(
          world,
          pathWaypoints,
          radius,
          targetPathIndex,
          motion.pathProgress,
          state.color
        );
      }
    }

    // If the next rule is already due (freshly crossed, or caught up on after
    // the jump above), open its telegraph: the enemy holds its ground for
    // TELEGRAPH_SECONDS while a ring burst plays at its standing position, so
    // the cross is telegraphed rather than a surprise jump.
    if (
      swap.telegraphReadyAt === 0 &&
      swap.nextSwap < swap.swaps.length &&
      motion.pathProgress >= swap.swaps[swap.nextSwap].atProgress
    ) {
      swap.telegraphReadyAt = simulationTimeSeconds + TELEGRAPH_SECONDS;
      requestSwapBurst(
        world,
        pathWaypoints,
        radius,
        state.pathIndex,
        motion.pathProgress,
        state.color,
        TELEGRAPH_SECONDS
      );
    }

    // The ability is one-shot per rule; drop it once the last is consumed.
    if (swap.nextSwap >= swap.swaps.length) {
      entity.remove(PathSwap);
    }
  });
};

/**
 * Raises a "spawn" ring burst at a point along `pathIndex` (converted to the
 * planet surface) — the telegraph ring at the standing position (with a
 * `duration`) or the arrival burst after a cross.
 */
const requestSwapBurst = (
  world: World,
  pathWaypoints: PathWaypoint[][],
  radius: number,
  pathIndex: number,
  pathProgress: number,
  color: string,
  duration?: number
): void => {
  const point = getPositionAlongMultiplePaths(pathWaypoints, pathIndex, pathProgress);
  flatFieldToSphereSurface(point.x, point.z, radius, scratchSurface, scratchNormal);
  scratchPos
    .copy(scratchSurface)
    .addScaledVector(scratchNormal, point.y + 0.1);
  effectActions(world).requestSpawnEffect(
    [scratchPos.x, scratchPos.y, scratchPos.z],
    color,
    "spawn",
    duration
  );
};

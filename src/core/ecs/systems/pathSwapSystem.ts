import type { World } from "koota";

import { getPositionAlongMultiplePaths, getPathDirection } from "../../../utils/pathUtils";
import type { PathWaypoint } from "../../types/game";
import { EnemyMotion, EnemyState } from "../traits/enemy";
import { FacingDirection } from "../traits/facing";
import {
  PATH_SWAP_ARRIVAL_SECONDS,
  PATH_SWAP_TELEGRAPH_SECONDS,
  PathSwap,
} from "../traits/pathSwap";
import { Position } from "../traits/position";

export type PathSwapSystemOptions = {
  pathWaypoints: PathWaypoint[][];
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
 * `telegraphReadyAt` one simulation second ahead. Until then the enemy
 * **stands still** (the movement system skips advancing it while
 * `telegraphReadyAt > simulationTimeSeconds`), and the `PathSwapEffect` view
 * shows a wind-up ring and rising particles around the enemy for that second,
 * so the player sees the cross coming and knows when it will happen. When the
 * timestamp arrives the cross is performed and the view plays a short arrival
 * burst at the new position. If the next rule is already due at that moment
 * (or was skipped past by a large frame step), it is telegraphed right away;
 * otherwise the enemy resumes walking until that rule's threshold.
 *
 * The movement system derives the enemy's `Position` and `FacingDirection`
 * from `(pathIndex, pathProgress)` every frame, so the cross normally only
 * rewrites `pathIndex`; the enemy is on the new route when it moves (the
 * system runs just before the movement pass). The cross also re-places the
 * enemy itself on the jump, because a chained telegraph (the next rule already
 * due) freezes the enemy before the movement pass can re-derive its position.
 *
 * Each rule fires at most once; the trait is removed as soon as the last rule
 * is consumed (or the enemy reaches the path end), so the ability is one-shot
 * per rule and a re-spawned enemy does not inherit it. `EnemyState`/
 * `EnemyMotion`, `Position` and `FacingDirection` are queried alongside
 * `PathSwap` so the cross can write them in place (the path re-assignment and
 * the landing re-place); `PathSwap` is removed when done (the same pattern the
 * slow system uses to consume its request).
 */
export const runPathSwapSystem = (
  world: World,
  options: PathSwapSystemOptions
): void => {
  const { pathWaypoints, simulationTimeSeconds } = options;

  // EnemyState/EnemyMotion are queried so they can be written in place (the
  // cross re-assigns pathIndex); Position/FacingDirection are queried so the
  // jump can re-place the enemy in place (spawnEnemy always adds all four).
  world
    .query(PathSwap, EnemyState, EnemyMotion, Position, FacingDirection)
    .updateEach(([swap, state, motion, position, facing], entity) => {
      if (state.health <= 0) {
        entity.remove(PathSwap);
        return;
      }

      // No rules left (including an empty list): keep the trait only while the
      // arrival burst of the last cross is still playing (the view reads it),
      // then drop the ability.
      if (swap.nextSwap >= swap.swaps.length) {
        if (
          swap.lastCrossAt === 0 ||
          simulationTimeSeconds - swap.lastCrossAt >= PATH_SWAP_ARRIVAL_SECONDS
        ) {
          entity.remove(PathSwap);
        }
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
          swap.lastCrossAt = simulationTimeSeconds;

          // Place the enemy at the new location right away (position + facing).
          // If the next rule is already due, its telegraph starts on this very
          // pass and the movement pass then skips the frozen enemy, so without
          // this the enemy would keep rendering on the old path while standing
          // (and the telegraph ring would play) on the new one — a chained
          // 0 → 1 → 0 cross would never visibly show the middle path.
          const point = getPositionAlongMultiplePaths(
            pathWaypoints,
            targetPathIndex,
            motion.pathProgress
          );
          position.x = point.x;
          position.y = point.y;
          position.z = point.z;
          const direction = getPathDirection(
            pathWaypoints[targetPathIndex],
            motion.pathProgress
          );
          facing.x = direction.x;
          facing.z = direction.z;
        }
      }

      // If the next rule is already due (freshly crossed, or caught up on
      // after the jump above), open its telegraph: the enemy holds its ground
      // for the wind-up while the view plays the ring around it, so the cross
      // is telegraphed rather than a surprise jump.
      if (
        swap.telegraphReadyAt === 0 &&
        swap.nextSwap < swap.swaps.length &&
        motion.pathProgress >= swap.swaps[swap.nextSwap].atProgress
      ) {
        swap.telegraphReadyAt = simulationTimeSeconds + PATH_SWAP_TELEGRAPH_SECONDS;
      }
    });
};

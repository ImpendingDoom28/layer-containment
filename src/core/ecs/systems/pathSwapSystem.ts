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

export type PathSwapSystemOptions = {
  pathWaypoints: PathWaypoint[][];
  /** Planet radius, used to convert the swap position to a surface effect. */
  radius: number;
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
 * The movement system derives the enemy's `Position` and `FacingDirection`
 * from `(pathIndex, pathProgress)` every frame, so this system only rewrites
 * `pathIndex`; the enemy is already on the new route when it moves this frame
 * (the system runs just before the movement pass). A `spawn`-type burst is
 * raised at the new position so the cross-over reads as a short teleport.
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
  const { pathWaypoints, radius } = options;

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

    // Fire every rule whose threshold the enemy has crossed, in order (an
    // enemy already past several thresholds — a large frame step or a
    // mid-path spawn — catches up on all of them this pass).
    while (swap.nextSwap < swap.swaps.length) {
      const rule = swap.swaps[swap.nextSwap];
      if (motion.pathProgress < rule.atProgress) break;

      const targetPathIndex = rule.targetPathIndex;
      const valid =
        targetPathIndex >= 0 &&
        targetPathIndex < pathWaypoints.length &&
        targetPathIndex !== state.pathIndex;

      // Consume the rule; an invalid or no-op re-assignment (a target equal
      // to the current path, e.g. post-merge) is skipped without moving.
      swap.nextSwap += 1;
      if (!valid) continue;

      // Re-assign to the target path, keeping the current progress fraction.
      // On mirror-symmetric approaches this is the mirrored position.
      state.pathIndex = targetPathIndex;

      // Raise a spawn burst at the new position (flat field → planet surface),
      // so the cross-over reads as a short teleport rather than a silent jump.
      const newPoint = getPositionAlongMultiplePaths(
        pathWaypoints,
        targetPathIndex,
        motion.pathProgress
      );
      flatFieldToSphereSurface(
        newPoint.x,
        newPoint.z,
        radius,
        scratchSurface,
        scratchNormal
      );
      scratchPos
        .copy(scratchSurface)
        .addScaledVector(scratchNormal, newPoint.y + 0.1);
      effectActions(world).requestSpawnEffect(
        [scratchPos.x, scratchPos.y, scratchPos.z],
        state.color,
        "spawn"
      );
    }

    // The ability is one-shot per rule; drop it once the last is consumed.
    if (swap.nextSwap >= swap.swaps.length) {
      entity.remove(PathSwap);
    }
  });
};

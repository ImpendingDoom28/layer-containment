import { trait } from "koota";

/**
 * How long (simulation seconds) an enemy stands still, telegraphed, before a
 * pending cross fires. The wind-up visual (the ring + gathering particles
 * around the enemy) lasts this long, so it disappears exactly when the jump
 * happens.
 */
export const PATH_SWAP_TELEGRAPH_SECONDS = 1;

/**
 * How long (simulation seconds) the arrival burst plays after a cross. The
 * trait is kept this long after the final cross so the landing visual can play
 * even though the ability is one-shot. The "materialize" animation window (see
 * `getPathSwapAnimationState`) matches it: the body holds its final pose for
 * the remainder of the trait's lifetime, so both end together.
 */
export const PATH_SWAP_ARRIVAL_SECONDS = 0.45;

/**
 * How long (simulation seconds) before the cross the "beam up" animation plays
 * (the last stretch of the telegraph: the body shrinks into a thin beam at its
 * old position, and the cross then moves it). Shorter than the telegraph, so
 * most of the wind-up still shows the body charging up (blinking).
 */
export const PATH_SWAP_BEAM_UP_SECONDS = 0.38;

/**
 * The logical animation state of an enemy mid path-swap (for a model whose
 * own clips carry a `teleport-out` / `teleport-in` pair — see
 * `ModelAnimation`). The cross is instantaneous (the enemy is re-placed the
 * moment `telegraphReadyAt` is reached), so the two clips bookend it:
 *
 * - `teleport-out`: during the last `PATH_SWAP_BEAM_UP_SECONDS` of the
 *   telegraph, while the body is still at its old position.
 * - `teleport-in`: for `PATH_SWAP_ARRIVAL_SECONDS` after the cross, at the new
 *   position (the body materializes from the beam pose the out-clip ended on).
 * - `null` otherwise: the caller falls back to its ordinary state (walk while
 *   moving, idle while standing) — during the early telegraph the body stands
 *   still and blinks like before.
 *
 * Pure and allocation-free: it reads only the trait's timestamps, so it can be
 * called from a per-frame `getState` resolver.
 */
export const getPathSwapAnimationState = (
  swap: Pick<PathSwapData, "telegraphReadyAt" | "lastCrossAt">,
  now: number
): "teleport-out" | "teleport-in" | null => {
  if (swap.telegraphReadyAt > 0 && swap.telegraphReadyAt > now) {
    const remaining = swap.telegraphReadyAt - now;
    return remaining <= PATH_SWAP_BEAM_UP_SECONDS ? "teleport-out" : null;
  }
  if (
    swap.lastCrossAt > 0 &&
    now - swap.lastCrossAt < PATH_SWAP_ARRIVAL_SECONDS
  ) {
    return "teleport-in";
  }
  return null;
};

/**
 * One path-swap rule: when the enemy's `pathProgress` first crosses
 * `atProgress`, it is re-assigned onto `targetPathIndex`.
 */
export type PathSwapRule = {
  /** Normalized path-progress threshold (0..1) at which the swap fires. */
  atProgress: number;
  /**
   * Path index the enemy is re-assigned onto (into the level's `pathWaypoints`).
   * The enemy keeps its current `pathProgress`, so on mirror-symmetric
   * approaches it lands on the mirrored lane of that path.
   */
  targetPathIndex: number;
};

export type PathSwapData = {
  /**
   * One-shot swap rules, applied in order as the enemy's `pathProgress`
   * crosses each rule's `atProgress`. Empty = no swaps.
   */
  swaps: PathSwapRule[];
  /** Index into `swaps` of the next pending rule; `swaps.length` = all done. */
  nextSwap: number;
  /**
   * The simulation timestamp at which the pending swap's jump actually
   * happens (0 = no telegraph in flight). While it is greater than the current
   * simulation time the enemy stands still — a short, visible wind-up — so the
   * player sees the cross coming and knows when it will happen. The
   * movement system skips advancing any enemy in this state.
   */
  telegraphReadyAt: number;
  /**
   * The simulation timestamp at which the most recent cross fired (0 = none
   * yet). The `PathSwapEffect` view plays an arrival burst for
   * `PATH_SWAP_ARRIVAL_SECONDS` after it; the trait is kept that long after the
   * final cross so the landing visual can play even though the ability is
   * one-shot.
   */
  lastCrossAt: number;
};

const createDefaultPathSwap = (): PathSwapData => ({
  swaps: [],
  nextSwap: 0,
  telegraphReadyAt: 0,
  lastCrossAt: 0,
});

/**
 * A generic, reusable path-swap ability: an enemy carrying this trait is
 * re-assigned onto a different path while keeping its current `pathProgress`,
 * whenever its `pathProgress` crosses a rule's `atProgress`.
 *
 * Not boss-specific — any enemy can carry it. The Sector 2 "Ferryman" boss
 * uses it to flip front between the two portal approaches: the approaches are
 * mirror-symmetric (same z rows, x mirrored), so keeping the same
 * `pathProgress` lands the boss on the mirrored lane of the other path — a
 * clean cross that never pops it into water or a building.
 *
 * Each swap is telegraphed: the PathSwapSystem sets `telegraphReadyAt`
 * (one second ahead of the current simulation time) and plays a "spawn" ring
 * burst at the standing position, and the enemy stays in place until that
 * timestamp — then it performs the cross and plays an arrival burst. The
 * system drives `nextSwap` and removes the trait once every rule has fired
 * (or the enemy reaches the path end), so the ability is one-shot per rule
 * and a re-spawned enemy does not inherit it.
 *
 * AoS (callback) rather than SoA: `swaps` is an array, and SoA traits only
 * hold primitive fields (the same reason the enemy state/motion are split).
 */
export const PathSwap = trait(createDefaultPathSwap);

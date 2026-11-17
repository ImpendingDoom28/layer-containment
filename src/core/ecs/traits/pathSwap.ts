import { trait } from "koota";

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
};

const createDefaultPathSwap = (): PathSwapData => ({
  swaps: [],
  nextSwap: 0,
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
 * The PathSwapSystem drives `nextSwap` and removes the trait once every rule
 * has fired (or the enemy reaches the path end), so the ability is one-shot
 * per rule and a re-spawned enemy does not inherit it.
 *
 * AoS (callback) rather than SoA: `swaps` is an array, and SoA traits only
 * hold primitive fields (the same reason the enemy state/motion are split).
 */
export const PathSwap = trait(createDefaultPathSwap);

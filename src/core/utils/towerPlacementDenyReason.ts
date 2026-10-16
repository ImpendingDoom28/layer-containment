import type { TilePlacementState } from "../../utils/tilePlacement";

export type TowerPlacementDenyReason = "insufficient_funds" | "blocked_tile";

/**
 * Maps the affordability and tile-availability guards of a tower placement
 * attempt to the reason a denied action should be announced as, or null when
 * the placement is allowed. Evaluated in the same order `placeTower` runs the
 * guards, so the first failing gate wins.
 */
export const getTowerPlacementDenyReason = (
  canAfford: boolean,
  placementState: TilePlacementState | null
): TowerPlacementDenyReason | null => {
  if (!canAfford) return "insufficient_funds";
  if (placementState?.isBlocked) return "blocked_tile";
  return null;
};

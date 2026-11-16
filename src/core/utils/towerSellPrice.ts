import type { Tower } from "../types/game";

/**
 * The refund a tower pays on sale. A tower placed in the current build phase
 * (no wave active when it was placed, and no wave started since) is fully
 * refundable, so placing one and selling it straight away loses nothing while
 * the player experiments between waves. The moment the next wave starts the
 * wave system clears the flag, so towers from an earlier build phase — like
 * towers placed during an active wave and a level's pre-placed towers — sell
 * for the standard `towerSellPriceMultiplier` fraction of their cost.
 */
export const getTowerSellPrice = (
  tower: Tower,
  towerSellPriceMultiplier: number
): number =>
  tower.placedBetweenWaves
    ? tower.cost
    : Math.floor(tower.cost * towerSellPriceMultiplier);

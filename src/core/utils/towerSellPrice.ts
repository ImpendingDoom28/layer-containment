import type { Tower } from "../types/game";

/**
 * The refund a tower pays on sale. A tower placed while no wave was active
 * (a build phase — before wave 1 or after the previous wave cleared) is fully
 * refundable, so placing one and selling it straight away loses nothing while
 * the player experiments between waves. A tower placed during an active wave
 * (or a level's pre-placed towers, which were never bought mid-build) sells
 * for the standard `towerSellPriceMultiplier` fraction of its cost.
 */
export const getTowerSellPrice = (
  tower: Tower,
  towerSellPriceMultiplier: number
): number =>
  tower.placedBetweenWaves
    ? tower.cost
    : Math.floor(tower.cost * towerSellPriceMultiplier);

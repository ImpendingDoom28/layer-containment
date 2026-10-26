import type { TowerType } from "../types/game";

/**
 * The `data-hud-animation-id` of a tower shop row. Shared by the shop (which
 * declares the attribute) and the placement denial (which targets the row for
 * the denial shake).
 */
export const towerShopRowElementId = (towerType: TowerType): string =>
  `tower-shop-row-${towerType}`;

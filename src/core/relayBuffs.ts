import type { Tower, TowerConfig, TowerType } from "./types/game";
import { isAdjacent4 } from "../utils/mathUtils";

export const getEffectiveTowerCombatStats = (
  tower: Tower,
  allTowers: Tower[],
  towerTypes: Partial<Record<TowerType, TowerConfig>>
): { damage: number; range: number } => {
  if (tower.type === "relay") {
    return { damage: tower.damage, range: tower.range };
  }

  const relayTemplate = towerTypes["relay"];
  const adjacentRelays = allTowers
    .filter(
      (t) =>
        t.type === "relay" &&
        t.id !== tower.id &&
        isAdjacent4(tower.gridX, tower.gridZ, t.gridX, t.gridZ)
    )
    .sort((a, b) => a.id - b.id);

  let damageMultiplier = 1;
  let rangeMultiplier = 1;

  if (relayTemplate && adjacentRelays.length > 0) {
    const perDamage = relayTemplate.relayNeighborDamageBonusFraction ?? 0;
    const perRange = relayTemplate.relayNeighborRangeBonusFraction ?? 0;
    const dim = relayTemplate.relayDiminishingFactor ?? 0.5;

    let damageBonus = 0;
    let rangeBonus = 0;
    for (let i = 0; i < adjacentRelays.length; i++) {
      const w = dim ** i;
      damageBonus += perDamage * w;
      rangeBonus += perRange * w;
    }

    damageMultiplier = 1 + damageBonus;
    rangeMultiplier = 1 + rangeBonus;
  }

  return {
    damage: tower.damage * damageMultiplier,
    range: tower.range * rangeMultiplier,
  };
};

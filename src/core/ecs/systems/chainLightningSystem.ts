import type { World } from "koota";

import type { Enemy, Tower } from "../../types/game";
import { distance2D } from "../../../utils/mathUtils";
import { EnemyMotion, EnemyState, IsEnemy } from "../traits/enemy";
import { Position } from "../traits/position";

export type ChainAdditionalHit = { enemyId: number; damage: number };

/**
 * Resolves the extra hops a chain-lightning bolt takes after its primary target.
 *
 * Reads living enemies straight from the world (a read-only query over the
 * enemy traits) rather than accepting an `Enemy[]`, so the tower no longer
 * threads a snapshot list through to the chain computation. Each hop picks the
 * nearest un-hit living enemy that is in range of either the tower or the
 * previous hop, and damage decays by `multiplierPerHop` per hop.
 */
export const computeChainAdditionalHits = (
  world: World,
  tower: Tower,
  firstTarget: Enemy,
  baseDamage: number,
  towerRange: number,
  maxHops: number,
  multiplierPerHop: number
): ChainAdditionalHit[] => {
  const hitIds = new Set<number>([firstTarget.id]);
  let lastX = firstTarget.x;
  let lastZ = firstTarget.z;
  let currentDamage = baseDamage;
  const extras: ChainAdditionalHit[] = [];

  for (let hop = 0; hop < maxHops; hop++) {
    currentDamage *= multiplierPerHop;

    let nextId: number | null = null;
    let nextX = 0;
    let nextZ = 0;
    let nearestDist = Infinity;

    world
      .query(IsEnemy, EnemyState, EnemyMotion, Position)
      .readEach(([state, , position]) => {
        if (state.health <= 0 || hitIds.has(state.id)) return;

        const fromTower =
          distance2D(tower.x, tower.z, position.x, position.z) <= towerRange;
        const fromLast =
          distance2D(lastX, lastZ, position.x, position.z) <= towerRange;
        if (!fromTower && !fromLast) return;

        const dist = distance2D(lastX, lastZ, position.x, position.z);
        if (dist < nearestDist) {
          nearestDist = dist;
          nextId = state.id;
          nextX = position.x;
          nextZ = position.z;
        }
      });

    if (nextId === null) break;

    extras.push({ enemyId: nextId, damage: currentDamage });
    hitIds.add(nextId);
    lastX = nextX;
    lastZ = nextZ;
  }

  return extras;
};

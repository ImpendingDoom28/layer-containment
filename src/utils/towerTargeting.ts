import type { Enemy, TowerTargeting } from "../core/types/game";
import { distance2D } from "./mathUtils";

export const TARGETING_STRATEGIES: readonly TowerTargeting[] = [
  "nearest",
  "furthest",
  "lowest",
  "highest",
  "focused",
];

export type TargetingParams = {
  /** The tower's ground-plane position. */
  x: number;
  z: number;
  range: number;
  /** Focused: the enemy the tower was aiming at last time it fired. */
  lastTargetId?: number;
};

/**
 * Pick the enemy a tower should shoot this volley, by targeting strategy.
 *
 * - "nearest" / "furthest": the in-range enemy closest to / farthest from the
 *   tower.
 * - "lowest" / "highest": the in-range enemy with the lowest / highest
 *   current health (a weak or a tanky priority, independent of distance).
 * - "focused": keeps shooting the last enemy it fired at as long as that
 *   enemy is alive, in range, and has line of sight; otherwise falls back to
 *   the nearest candidate so the tower is never idle with a visible enemy
 *   in range.
 *
 * `isVisible` is the caller's line-of-sight check (obstacles included);
 * a dead or out-of-range enemy is never returned.
 */
export const pickTowerTarget = (
  enemies: readonly Enemy[],
  strategy: TowerTargeting,
  params: TargetingParams,
  isVisible: (enemy: Enemy) => boolean
): Enemy | null => {
  const candidates: Enemy[] = [];
  for (const enemy of enemies) {
    if (enemy.health <= 0) continue;
    if (distance2D(params.x, params.z, enemy.x, enemy.z) > params.range) continue;
    if (!isVisible(enemy)) continue;
    candidates.push(enemy);
  }
  if (candidates.length === 0) return null;

  switch (strategy) {
    case "furthest": {
      let best: Enemy | null = null;
      let maxDistance = -1;
      for (const enemy of candidates) {
        const dist = distance2D(params.x, params.z, enemy.x, enemy.z);
        if (dist > maxDistance) {
          maxDistance = dist;
          best = enemy;
        }
      }
      return best;
    }
    case "lowest": {
      let best = candidates[0];
      for (const enemy of candidates) {
        if (enemy.health < best.health) best = enemy;
      }
      return best;
    }
    case "highest": {
      let best = candidates[0];
      for (const enemy of candidates) {
        if (enemy.health > best.health) best = enemy;
      }
      return best;
    }
    case "focused": {
      if (params.lastTargetId !== undefined) {
        const focused = candidates.find((e) => e.id === params.lastTargetId);
        if (focused) return focused;
      }
      return pickNearestEnemy(candidates, params.x, params.z);
    }
    case "nearest":
    default:
      return pickNearestEnemy(candidates, params.x, params.z);
  }
};

const pickNearestEnemy = (
  enemies: readonly Enemy[],
  x: number,
  z: number
): Enemy | null => {
  let best: Enemy | null = null;
  let minDistance = Infinity;
  for (const enemy of enemies) {
    const dist = distance2D(x, z, enemy.x, enemy.z);
    if (dist < minDistance) {
      minDistance = dist;
      best = enemy;
    }
  }
  return best;
};

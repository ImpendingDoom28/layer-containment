import type { Enemy } from "../core/types/game";

/**
 * A flat (ground-plane) rectangular obstacle that blocks tower line of
 * sight, e.g. a building or the base. `halfWidth`/`halfDepth` are the
 * footprint half-extends around the center; a cylinder footprint is
 * approximated by its circumscribing square, which is conservative for
 * line-of-sight (blocks at least as much as the circle does).
 */
export type LineOfSightObstacle = {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
};

/**
 * Calculate distance between two 2D points (ignoring Y)
 */
export function distance2D(
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.hypot(dx, dz);
}

/**
 * Find nearest enemy to a point
 */
export function findNearestEnemy(
  enemies: Enemy[],
  x: number,
  z: number
): Enemy | null {
  if (!enemies || enemies.length === 0) return null;

  let nearest: Enemy | null = null;
  let minDistance = Infinity;

  enemies.forEach((enemy) => {
    if (enemy.health <= 0) return;
    const dist = distance2D(x, z, enemy.x, enemy.z);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = enemy;
    }
  });

  return nearest;
}

/**
 * Find furthest enemy to a point
 */
export function findFurthestEnemy(
  enemies: Enemy[],
  x: number,
  z: number
): Enemy | null {
  if (!enemies || enemies.length === 0) return null;

  let furthest: Enemy | null = null;
  let maxDistance = -1;

  enemies.forEach((enemy) => {
    if (enemy.health <= 0) return;
    const dist = distance2D(x, z, enemy.x, enemy.z);
    if (dist > maxDistance) {
      maxDistance = dist;
      furthest = enemy;
    }
  });

  return furthest;
}

/**
 * Find all enemies in range (for AOE)
 */
export function findEnemiesInRange(
  enemies: Enemy[],
  x: number,
  z: number,
  range: number
): Enemy[] {
  return enemies.filter((enemy) => {
    if (enemy.health <= 0) return false;
    return distance2D(x, z, enemy.x, enemy.z) <= range;
  });
}

/**
 * Find all enemies in a line from start point through target point
 * Returns enemies sorted by distance from start point (closest first)
 */
export function findEnemiesInLine(
  enemies: Enemy[],
  startX: number,
  startZ: number,
  targetX: number,
  targetZ: number,
  maxPierce: number,
  threshold: number = 0.5
): Enemy[] {
  if (!enemies || enemies.length === 0) return [];

  const dx = targetX - startX;
  const dz = targetZ - startZ;
  const lineLength = Math.hypot(dx, dz);

  if (lineLength === 0) return [];

  const lineDirX = dx / lineLength;
  const lineDirZ = dz / lineLength;

  const enemiesInLine: Array<{ enemy: Enemy; distance: number }> = [];

  enemies.forEach((enemy) => {
    if (enemy.health <= 0) return;

    const enemyDx = enemy.x - startX;
    const enemyDz = enemy.z - startZ;

    const projectionLength = enemyDx * lineDirX + enemyDz * lineDirZ;

    // Extend the line slightly beyond the target to catch enemies near the end
    if (projectionLength < -0.1 || projectionLength > lineLength + 0.1) return;

    const projectionX = startX + lineDirX * projectionLength;
    const projectionZ = startZ + lineDirZ * projectionLength;

    const distToLine = distance2D(enemy.x, enemy.z, projectionX, projectionZ);

    // Use enemy size in threshold calculation - beam should hit if it's within enemy radius
    const effectiveThreshold = Math.max(threshold, enemy.size * 0.8);

    if (distToLine <= effectiveThreshold) {
      const distFromStart = distance2D(startX, startZ, enemy.x, enemy.z);
      enemiesInLine.push({ enemy, distance: distFromStart });
    }
  });

  enemiesInLine.sort((a, b) => a.distance - b.distance);

  return enemiesInLine.slice(0, maxPierce).map((item) => item.enemy);
}

/**
 * Whether the straight line from (x1, z1) to (x2, z2) crosses the interior
 * of any obstacle (slab test). Degenerate segments never block.
 */
export function segmentCrossesObstacles(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  obstacles: readonly LineOfSightObstacle[]
): boolean {
  if (obstacles.length === 0) return false;

  const dx = x2 - x1;
  const dz = z2 - z1;
  if (dx === 0 && dz === 0) return false;

  // t-interval of the segment: [0, 1]
  let tMin = 0;
  let tMax = 1;

  for (const o of obstacles) {
    const ox1 = o.x - o.halfWidth;
    const ox2 = o.x + o.halfWidth;
    const oz1 = o.z - o.halfDepth;
    const oz2 = o.z + o.halfDepth;

    // X slab
    if (Math.abs(dx) < 1e-9) {
      // Parallel to the slab: outside it means the segment never crosses.
      if (x1 < ox1 || x1 > ox2) return false;
    } else {
      let t0 = (ox1 - x1) / dx;
      let t1 = (ox2 - x1) / dx;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
      if (tMin > tMax) return false;
    }

    // Z slab
    if (Math.abs(dz) < 1e-9) {
      if (z1 < oz1 || z1 > oz2) return false;
    } else {
      let t0 = (oz1 - z1) / dz;
      let t1 = (oz2 - z1) / dz;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
      if (tMin > tMax) return false;
    }
  }

  return true;
}

/**
 * Whether a tower at (towerX, towerZ) has an unobstructed line of sight to
 * (targetX, targetZ) — i.e. no static obstacle sits strictly between them.
 */
export function hasLineOfSight(
  towerX: number,
  towerZ: number,
  targetX: number,
  targetZ: number,
  obstacles: readonly LineOfSightObstacle[]
): boolean {
  return !segmentCrossesObstacles(
    towerX,
    towerZ,
    targetX,
    targetZ,
    obstacles
  );
}

/**
 * Distance along the (unit) ray from (originX, originZ) where it first
 * enters any obstacle's footprint; `Infinity` when the ray misses them all.
 */
export function getRayObstacleClipDistance(
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  obstacles: readonly LineOfSightObstacle[]
): number {
  let clipDistance = Infinity;

  for (const o of obstacles) {
    let tMin = 0;
    let tMax = Infinity;

    // X slab
    if (Math.abs(dirX) < 1e-9) {
      if (originX < o.x - o.halfWidth || originX > o.x + o.halfWidth) continue;
    } else {
      let t0 = (o.x - o.halfWidth - originX) / dirX;
      let t1 = (o.x + o.halfWidth - originX) / dirX;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
      if (tMin > tMax) continue;
    }

    // Z slab
    if (Math.abs(dirZ) < 1e-9) {
      if (originZ < o.z - o.halfDepth || originZ > o.z + o.halfDepth) continue;
    } else {
      let t0 = (o.z - o.halfDepth - originZ) / dirZ;
      let t1 = (o.z + o.halfDepth - originZ) / dirZ;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
      if (tMin > tMax) continue;
    }

    if (tMin < clipDistance) clipDistance = tMin;
  }

  return clipDistance;
}

export const isAdjacent4 = (
  ax: number,
  az: number,
  bx: number,
  bz: number
): boolean => {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
};

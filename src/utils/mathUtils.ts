import type { Enemy } from "../core/types/game";

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

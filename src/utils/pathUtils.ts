import type { PathWaypoint } from "../core/types/game";

export type PathSegment = {
  p1: PathWaypoint;
  p2: PathWaypoint;
  length: number;
  startProgress: number;
};

export type RenderPathSegment = {
  start: PathWaypoint;
  end: PathWaypoint;
  dx: number;
  dz: number;
  length: number;
  centerX: number;
  centerZ: number;
  yaw: number;
};

export const getPathSegmentYaw = (dx: number, dz: number) => {
  return Math.atan2(-dz, dx);
};

export const getPathRenderSegments = (
  pathWaypoints: PathWaypoint[]
): RenderPathSegment[] => {
  return pathWaypoints.slice(0, -1).map((waypoint, index) => {
    const nextWaypoint = pathWaypoints[index + 1];
    const dx = nextWaypoint.x - waypoint.x;
    const dz = nextWaypoint.z - waypoint.z;

    return {
      start: waypoint,
      end: nextWaypoint,
      dx,
      dz,
      length: Math.hypot(dx, dz),
      centerX: waypoint.x + dx / 2,
      centerZ: waypoint.z + dz / 2,
      yaw: getPathSegmentYaw(dx, dz),
    };
  });
};

/**
 * Check if position is at the end of the path
 */
export function isAtPathEnd(
  progress: number,
  threshold: number = 0.99
): boolean {
  return progress >= threshold;
}

/**
 * Calculate the distance from a point to a line segment
 */
export function pointToLineSegmentDistance(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSq = dx * dx + dz * dz;

  if (lengthSq === 0) {
    // Segment is a point
    const distX = px - x1;
    const distZ = pz - z1;
    return Math.sqrt(distX * distX + distZ * distZ);
  }

  // Calculate t (parameter along the segment)
  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lengthSq)
  );

  // Find the closest point on the segment
  const closestX = x1 + t * dx;
  const closestZ = z1 + t * dz;

  // Return distance to closest point
  const distX = px - closestX;
  const distZ = pz - closestZ;
  return Math.sqrt(distX * distX + distZ * distZ);
}

/**
 * Get position along path based on progress (0 to 1)
 */
export function getPositionAlongPath(
  progress: number,
  pathWaypoints: PathWaypoint[]
): PathWaypoint {
  if (progress <= 0) return { ...pathWaypoints[0] };
  if (progress >= 1) return { ...pathWaypoints[pathWaypoints.length - 1] };

  // Calculate total path length
  const segments: PathSegment[] = [];
  let totalLength = 0;

  for (let i = 0; i < pathWaypoints.length - 1; i++) {
    const p1 = pathWaypoints[i];
    const p2 = pathWaypoints[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    segments.push({ p1, p2, length, startProgress: totalLength });
    totalLength += length;
  }

  // Find which segment we're in
  const targetDistance = progress * totalLength;
  let currentDistance = 0;

  for (const segment of segments) {
    if (targetDistance <= currentDistance + segment.length) {
      const segmentProgress =
        (targetDistance - currentDistance) / segment.length;
      return {
        x: segment.p1.x + (segment.p2.x - segment.p1.x) * segmentProgress,
        y: segment.p1.y + (segment.p2.y - segment.p1.y) * segmentProgress,
        z: segment.p1.z + (segment.p2.z - segment.p1.z) * segmentProgress,
      };
    }
    currentDistance += segment.length;
  }

  return { ...pathWaypoints[pathWaypoints.length - 1] };
}

/**
 * Check if a point is within a tile's bounds
 */
export function isPointInTile(
  pointX: number,
  pointZ: number,
  tileCenterX: number,
  tileCenterZ: number,
  halfTile: number
): boolean {
  return (
    pointX >= tileCenterX - halfTile &&
    pointX <= tileCenterX + halfTile &&
    pointZ >= tileCenterZ - halfTile &&
    pointZ <= tileCenterZ + halfTile
  );
}

/**
 * Check if a grid tile intersects with the path
 */
export function isGridTileOnPath(
  gridX: number,
  gridZ: number,
  gridOffset: number,
  tileSize: number,
  pathWaypoints: PathWaypoint[][],
  pathWidth: number
): boolean {
  // Convert grid coordinates to world coordinates (tile center)
  const tileCenterX = gridOffset + gridX + tileSize / 2;
  const tileCenterZ = gridOffset + gridZ + tileSize / 2;

  // Calculate tile bounds (corners)
  const halfTile = tileSize / 2;

  // First, check if any waypoint (corner) is within this tile
  // Corners take up the whole tile
  for (const path of pathWaypoints) {
    for (const waypoint of path) {
      if (
        isPointInTile(
          waypoint.x,
          waypoint.z,
          tileCenterX,
          tileCenterZ,
          halfTile
        )
      ) {
        return true;
      }
    }
  }

  const tileCorners = [
    { x: tileCenterX - halfTile, z: tileCenterZ - halfTile }, // bottom-left
    { x: tileCenterX + halfTile, z: tileCenterZ - halfTile }, // bottom-right
    { x: tileCenterX - halfTile, z: tileCenterZ + halfTile }, // top-left
    { x: tileCenterX + halfTile, z: tileCenterZ + halfTile }, // top-right
    { x: tileCenterX, z: tileCenterZ }, // center
  ];

  // Check each path segment (narrower path within tiles)
  for (const element of pathWaypoints) {
    for (let i = 0; i < element.length - 1; i++) {
      const p1 = element[i];
      const p2 = element[i + 1];

      // Check if any tile corner or center is within PATH_WIDTH/2 of the path segment
      for (const corner of tileCorners) {
        const distance = pointToLineSegmentDistance(
          corner.x,
          corner.z,
          p1.x,
          p1.z,
          p2.x,
          p2.z
        );

        // If any point is within half the path width, the tile intersects
        if (distance <= pathWidth / 2) {
          return true;
        }
      }
    }
  }

  return false;
}

export const getPositionAlongMultiplePaths = (
  paths: PathWaypoint[][],
  pathIndex: number,
  progress: number
): PathWaypoint => {
  const path = paths[pathIndex];
  if (!path || path.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return getPositionAlongPath(progress, path);
};

import type { PathWaypoint } from "../core/types/game";

export type PathIndex = {
  /** World x of every waypoint. */
  xs: number[];
  /** World y of every waypoint. */
  ys: number[];
  /** World z of every waypoint. */
  zs: number[];
  /** Cumulative distance from the start of the path to each waypoint. */
  cumulative: number[];
  /** Total path length. */
  totalLength: number;
};

/**
 * Precomputes the per-segment lengths and cumulative distances of a path so
 * lookups along it are O(log n) (binary search) with zero per-call
 * allocation, instead of the O(n) scan + segment-array allocation that
 * `getPositionAlongPath` does on every call. Built once per path; a path
 * array's identity is stable for the lifetime of a level.
 */
export const createPathIndex = (waypoints: PathWaypoint[]): PathIndex => {
  const count = waypoints.length;
  const xs = new Array<number>(count);
  const ys = new Array<number>(count);
  const zs = new Array<number>(count);
  const cumulative = new Array<number>(count);

  let total = 0;
  for (let i = 0; i < count; i++) {
    const wp = waypoints[i];
    xs[i] = wp.x;
    ys[i] = wp.y;
    zs[i] = wp.z;
    if (i > 0) {
      const dx = wp.x - waypoints[i - 1].x;
      const dz = wp.z - waypoints[i - 1].z;
      total += Math.sqrt(dx * dx + dz * dz);
    }
    cumulative[i] = total;
  }

  return { xs, ys, zs, cumulative, totalLength: total };
};

/**
 * Position along a precomputed path for a progress in [0, 1]. Matches the
 * linear-scan `getPositionAlongPath` (arc-length parameterization).
 */
export const getPositionAlongPathIndexed = (
  index: PathIndex,
  progress: number
): PathWaypoint => {
  const { xs, ys, zs, cumulative, totalLength } = index;
  const count = xs.length;

  if (count === 0) return { x: 0, y: 0, z: 0 };
  if (progress <= 0 || totalLength === 0) {
    return { x: xs[0], y: ys[0], z: zs[0] };
  }
  if (progress >= 1) {
    const last = count - 1;
    return { x: xs[last], y: ys[last], z: zs[last] };
  }

  const targetDistance = progress * totalLength;

  // Binary search: first waypoint whose cumulative distance >= target.
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < targetDistance) lo = mid + 1;
    else hi = mid;
  }
  // lo is the end waypoint of the segment containing the target point.
  const segmentStart = lo - 1;
  const segmentLength = cumulative[lo] - cumulative[segmentStart];
  const segmentProgress =
    segmentLength > 0
      ? (targetDistance - cumulative[segmentStart]) / segmentLength
      : 0;

  return {
    x: xs[segmentStart] + (xs[lo] - xs[segmentStart]) * segmentProgress,
    y: ys[segmentStart] + (ys[lo] - ys[segmentStart]) * segmentProgress,
    z: zs[segmentStart] + (zs[lo] - zs[segmentStart]) * segmentProgress,
  };
};

/**
 * Multi-path lookup built once per level: per-path precomputed indices.
 * Falls back to a zero position for unknown path indices, matching
 * `getPositionAlongMultiplePaths`.
 */
export type MultiPathIndex = {
  byPath: PathIndex[];
};

export const createMultiPathIndex = (
  paths: PathWaypoint[][]
): MultiPathIndex => ({
  byPath: paths.map((path) => createPathIndex(path)),
});

export const getPositionAlongMultiplePathsIndexed = (
  index: MultiPathIndex,
  pathIndex: number,
  progress: number
): PathWaypoint => {
  const path = index.byPath[pathIndex];
  if (!path) return { x: 0, y: 0, z: 0 };
  return getPositionAlongPathIndexed(path, progress);
};

/**
 * Drop-in replacement for `getPositionAlongMultiplePaths` that builds the
 * per-path index once per path-array identity (the level's zustand array is
 * stable for the level's lifetime) and then looks up in O(log n) with no
 * per-call allocation.
 */
const multiPathIndexCache = new WeakMap<PathWaypoint[][], MultiPathIndex>();

export const getPositionAlongMultiplePathsFast = (
  paths: PathWaypoint[][],
  pathIndex: number,
  progress: number
): PathWaypoint => {
  let index = multiPathIndexCache.get(paths);
  if (!index) {
    index = createMultiPathIndex(paths);
    multiPathIndexCache.set(paths, index);
  }
  return getPositionAlongMultiplePathsIndexed(index, pathIndex, progress);
};

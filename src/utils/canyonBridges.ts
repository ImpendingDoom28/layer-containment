import type { CanyonConfig, PathWaypoint } from "../core/types/game";
import {
  tileToWorldCoordinate,
  waypointToTile,
} from "./levelEditor";
import { flatFieldToSphereSurface } from "./planetSurfaceMapping";

/**
 * How high (above the ground surface) a bridge deck sits over a canyon. This
 * is the path `y` on the bridge; the visible deck top is
 * `BRIDGE_ELEVATION + pathYOffset` (see `Path.tsx`). The basin floor sits
 * `CANON_BASIN_DEPTH` below the surface, so the deck clears the basin with
 * `BRIDGE_ELEVATION + CANON_BASIN_DEPTH` of vertical room.
 */
export const BRIDGE_ELEVATION = 1.6;

/**
 * Per-tile canyon occupancy as a flat bitmask (1 = canyon, 0 = free), indexed
 * by `gridZ * gridSize + gridX`. Built once per level load and shared by the
 * renderer (the basin, walls, and bridge span) and the bridge-elevation
 * computation.
 */
export type CanyonMask = Uint8Array;

export const buildCanyonMask = (
  canyons: CanyonConfig[],
  gridSize: number
): CanyonMask => {
  const mask = new Uint8Array(gridSize * gridSize);
  for (const canyon of canyons) {
    if (
      canyon.gridX >= 0 &&
      canyon.gridX < gridSize &&
      canyon.gridZ >= 0 &&
      canyon.gridZ < gridSize
    ) {
      mask[canyon.gridZ * gridSize + canyon.gridX] = 1;
    }
  }
  return mask;
};

type SampledTilePoint = {
  gridX: number;
  gridZ: number;
  x: number;
  z: number;
};

/**
 * Resample a path into one point per grid tile it crosses (tile centers), in
 * order. Orthogonal paths (the editor's path tool is axis-aligned, and the
 * level test enforces it) re-sample to the exact tiles of the row/column, so
 * the path shape and total length are preserved — only the point count grows.
 * A diagonal segment falls back to its endpoint (never happens in practice).
 */
const samplePathToTilePoints = (
  path: PathWaypoint[],
  gridSize: number,
  tileSize: number
): SampledTilePoint[] => {
  const points: SampledTilePoint[] = [];
  const addPoint = (gridX: number, gridZ: number) => {
    const last = points[points.length - 1];
    if (last && last.gridX === gridX && last.gridZ === gridZ) return;
    points.push({
      gridX,
      gridZ,
      x: tileToWorldCoordinate(gridX, gridSize, tileSize),
      z: tileToWorldCoordinate(gridZ, gridSize, tileSize),
    });
  };

  for (let i = 0; i < path.length; i++) {
    const tile = waypointToTile(path[i], gridSize, tileSize);
    if (i === 0) {
      addPoint(tile.gridX, tile.gridZ);
      continue;
    }
    const prev = waypointToTile(path[i - 1], gridSize, tileSize);
    const stepX = Math.sign(tile.gridX - prev.gridX);
    const stepZ = Math.sign(tile.gridZ - prev.gridZ);
    if (stepX !== 0 && stepZ !== 0) {
      // Non-orthogonal segment: keep only the endpoint (no per-tile ramp).
      addPoint(tile.gridX, tile.gridZ);
      continue;
    }
    let cx = prev.gridX;
    let cz = prev.gridZ;
    let guard = 0;
    while ((cx !== tile.gridX || cz !== tile.gridZ) && guard < gridSize * 4) {
      cx += stepX;
      cz += stepZ;
      addPoint(cx, cz);
      guard += 1;
    }
  }

  return points;
};

/**
 * Bake a bridge elevation into every path that crosses a canyon.
 *
 * The level store's `pathWaypoints` is the single source of truth for the
 * enemy movement system (`position.y = waypoint.y`), tower aiming
 * (`targetPathPos.y`), and the path strip render (`yBase + pathYOffset`), so
 * elevating the waypoints here makes enemies ride the bridge, towers aim at
 * the bridge, and the deck render at the bridge height — all consistent, with
 * no per-entity changes.
 *
 * Each path is re-sampled per tile (orthogonal paths, so shape/length are
 * preserved). Tiles inside a canyon run sit at `BRIDGE_ELEVATION`; the single
 * tile on either side of a run is a midpoint ramp, giving a short 2-tile
 * approach instead of a vertical wall. Returns the input unchanged when the
 * level has no canyons.
 */
export const buildCanyonBridgePaths = (
  pathWaypoints: PathWaypoint[][],
  canyons: CanyonConfig[],
  gridSize: number,
  tileSize: number
): PathWaypoint[][] => {
  const mask = buildCanyonMask(canyons, gridSize);
  let hasCanyon = false;
  for (const v of mask) {
    if (v === 1) {
      hasCanyon = true;
      break;
    }
  }
  if (!hasCanyon) return pathWaypoints;

  return pathWaypoints.map((path) => {
    const points = samplePathToTilePoints(path, gridSize, tileSize);
    const isCanyon = points.map(
      (p) => mask[p.gridZ * gridSize + p.gridX] === 1
    );
    // Orthogonal levels are flat (y = 0); the bridge adds elevation on top.
    const elevation: number[] = points.map((_, i) =>
      isCanyon[i] ? BRIDGE_ELEVATION : 0
    );

    for (let i = 0; i < points.length; i++) {
      if (
        isCanyon[i] &&
        i > 0 &&
        !isCanyon[i - 1]
      ) {
        elevation[i - 1] = (elevation[i - 1] + BRIDGE_ELEVATION) / 2;
      }
      if (
        isCanyon[i] &&
        i < points.length - 1 &&
        !isCanyon[i + 1]
      ) {
        elevation[i + 1] = (elevation[i + 1] + BRIDGE_ELEVATION) / 2;
      }
    }

    return points.map((p, i) => ({ x: p.x, y: elevation[i], z: p.z }));
  });
};

/**
 * A single bridge tile: a canyon cell the path crosses, with the direction the
 * path travels through it. The renderer uses the world center + direction to
 * place the deck (the path strip), the side rails, and — on a run's first and
 * last tile — the support pillars that anchor the span to the canyon edges.
 */
export type BridgeTile = {
  gridX: number;
  gridZ: number;
  worldX: number;
  worldZ: number;
  dirX: number;
  dirZ: number;
  /** True on the first tile of a canyon run (path enters the canyon here). */
  isRunStart: boolean;
  /** True on the last tile of a canyon run (path leaves the canyon here). */
  isRunEnd: boolean;
};

/**
 * The bridge tiles a path crosses (the canyon cells under its span), in path
 * order, each tagged with the direction through the cell and whether it is at
 * the start or end of a run (so the renderer can anchor the support pillars at
 * the canyon's edges instead of every tile).
 */
export const getBridgeTiles = (
  path: PathWaypoint[],
  canyons: CanyonConfig[],
  gridSize: number,
  tileSize: number
): BridgeTile[] => {
  const mask = buildCanyonMask(canyons, gridSize);
  const points = samplePathToTilePoints(path, gridSize, tileSize);
  const isCanyon = points.map((p) => mask[p.gridZ * gridSize + p.gridX] === 1);
  const out: BridgeTile[] = [];

  for (let i = 0; i < points.length; i++) {
    if (!isCanyon[i]) continue;
    const p = points[i];
    // Direction through the cell: toward the next point, or back toward the
    // previous one at the path's end. Falls back to +x when degenerate.
    let dirX = 1;
    let dirZ = 0;
    const next = points[i + 1] ?? points[i - 1];
    if (next) {
      const dx = next.x - p.x;
      const dz = next.z - p.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-8) {
        dirX = dx / len;
        dirZ = dz / len;
      }
    }
    out.push({
      gridX: p.gridX,
      gridZ: p.gridZ,
      worldX: p.x,
      worldZ: p.z,
      dirX,
      dirZ,
      isRunStart: i === 0 || !isCanyon[i - 1],
      isRunEnd: i === points.length - 1 || !isCanyon[i + 1],
    });
  }

  return out;
};

/**
 * The depth of a canyon basin: how far below the surrounding land (the planet
 * surface) its flat floor sits. The carved bowl in the ground sphere, the rim
 * wall, and the floor-level features (boulders, the river slab, bridge anchor
 * piers) all derive from this one value.
 */
export const CANON_BASIN_DEPTH = 3.5;

/**
 * The width of the basin's bank: the S-curve rise from the flat floor to the
 * surface, measured outward from the canyon's edge. The bank sits under the
 * neighboring land tiles (sealing the cut in the ground sphere); the visible
 * rim is the tiles' own front faces.
 */
export const CANON_BASIN_RIM_FADE = 1.0;

/**
 * The world-space XZ bounding box of every canyon tile, exactly (no margin):
 * the minimum and maximum world edges of the canyon cells. The basin floor is
 * flat inside this rectangle and eases to the surface over
 * `CANON_BASIN_RIM_FADE` outside it (`sampleBasinFloorY`); the ground sphere
 * is cut by the rectangle grown by that width (`getBasinCapBBox`), so the
 * cap's rim and the hole's rim share one edge.
 */
export type CanyonWorldBBox = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export const getCanyonWorldBBox = (
  canyons: CanyonConfig[],
  gridSize: number,
  tileSize: number
): CanyonWorldBBox | null => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const canyon of canyons) {
    if (
      canyon.gridX < 0 ||
      canyon.gridX >= gridSize ||
      canyon.gridZ < 0 ||
      canyon.gridZ >= gridSize
    ) {
      continue;
    }
    const x = tileToWorldCoordinate(canyon.gridX, gridSize, tileSize);
    const z = tileToWorldCoordinate(canyon.gridZ, gridSize, tileSize);
    minX = Math.min(minX, x - tileSize / 2);
    maxX = Math.max(maxX, x + tileSize / 2);
    minZ = Math.min(minZ, z - tileSize / 2);
    maxZ = Math.max(maxZ, z + tileSize / 2);
  }
  if (minX === Infinity) return null;
  return { minX, maxX, minZ, maxZ };
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * The world Y of the basin floor at a world XZ point (the cap's height
 * there). Inside the canyon rectangle the floor is flat at the full depth
 * below the planet surface; outward from the rectangle's edge it rises back
 * to the surface over `CANON_BASIN_RIM_FADE` with an S-curve (tangent to the
 * land at the edge, tangent to the floor at the bottom) — a flat-bottomed
 * basin with sloped banks, sealed under the neighboring land tiles. Outside
 * the rectangle plus the bank it equals the surface exactly (depth 0).
 */
export const sampleBasinFloorY = (
  x: number,
  z: number,
  bbox: CanyonWorldBBox,
  radius: number
): number => {
  const distFromEdgeX = Math.max(
    Math.abs(x - (bbox.minX + bbox.maxX) / 2) - (bbox.maxX - bbox.minX) / 2,
    0
  );
  const distFromEdgeZ = Math.max(
    Math.abs(z - (bbox.minZ + bbox.maxZ) / 2) - (bbox.maxZ - bbox.minZ) / 2,
    0
  );
  const distFromEdge = Math.max(distFromEdgeX, distFromEdgeZ);
  const depth =
    CANON_BASIN_DEPTH * smoothstep(CANON_BASIN_RIM_FADE, 0, distFromEdge);
  const { surfacePoint } = flatFieldToSphereSurface(x, z, radius);
  return surfacePoint.y - depth;
};

/**
 * The world XZ rectangle (expanded by the bank width) over which the basin
 * cap is built, so the cap's rim lands exactly where the S-curve has eased
 * to the surface — the hole cut in the ground sphere has to match it.
 */
export const getBasinCapBBox = (
  bbox: CanyonWorldBBox
): CanyonWorldBBox => ({
  minX: bbox.minX - CANON_BASIN_RIM_FADE,
  maxX: bbox.maxX + CANON_BASIN_RIM_FADE,
  minZ: bbox.minZ - CANON_BASIN_RIM_FADE,
  maxZ: bbox.maxZ + CANON_BASIN_RIM_FADE,
});

import { BoxGeometry, type Quaternion, type Vector3 } from "three";

import { tileToWorldCoordinate } from "./levelEditor";
import {
  flatFieldToSphereTilePose,
  getPlanetRadius,
} from "./planetSurfaceMapping";

export type SphereTilePose = {
  position: Vector3;
  quaternion: Quaternion;
};

/**
 * The world pose a tile slab sits at: the flat-field grid cell lifted onto the
 * planet sphere so the slab's centre is `slabHalfHeight` above the surface.
 * Shared by the game's `Tile`/`WaterSurface` (slab height `pathYOffset`), the
 * editor's `EditorSphereTile` (fixed thin slab), and `CanyonTile`-style tiles.
 */
export const getSphereTilePose = (
  gridX: number,
  gridZ: number,
  gridSize: number,
  tileSize: number,
  slabHalfHeight: number
): SphereTilePose => {
  const worldX = tileToWorldCoordinate(gridX, gridSize, tileSize);
  const worldZ = tileToWorldCoordinate(gridZ, gridSize, tileSize);
  return flatFieldToSphereTilePose(
    worldX,
    worldZ,
    getPlanetRadius(gridSize, tileSize),
    slabHalfHeight
  );
};

// One geometry per (subdivided, tile size, slab height) triple, shared across
// every tile of a level. The subdivided top face gives the animated water's
// vertex displacement vertices to swell; plain slabs stay single-segment.
const slabGeometryCache = new Map<string, BoxGeometry>();
export const getSlabGeometry = (
  tileSize: number,
  slabHeight: number,
  subdividedTop: boolean
): BoxGeometry => {
  const key = `${subdividedTop ? 1 : 0}|${tileSize}x${slabHeight}`;
  const entry = slabGeometryCache.get(key);
  if (entry) return entry;
  const geometry = new BoxGeometry(
    tileSize,
    slabHeight,
    tileSize,
    subdividedTop ? 8 : undefined,
    1,
    subdividedTop ? 8 : undefined
  );
  slabGeometryCache.set(key, geometry);
  return geometry;
};

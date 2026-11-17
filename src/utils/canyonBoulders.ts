import { type Quaternion, Vector3 } from "three";

import { hashGrid2D } from "../core/tileGridHash";
import { sampleBasinFloorY, type CanyonWorldBBox } from "./canyonBridges";
import { tileToWorldCoordinate } from "./levelEditor";
import {
  flatFieldToSphereSurface,
  getSurfaceQuaternion,
} from "./planetSurfaceMapping";

export type BoulderSpec = {
  position: [number, number, number];
  radius: number;
};

// A handful of boulders on the floor for a rugged, eroded bed. The layout is
// deterministic from the tile's grid hash, so the scene-level bake
// (`CanyonBoulders`) and the per-tile fallback (`CanyonTile`) place identical
// boulders.
export const buildBoulderLayout = (
  seed: number
): BoulderSpec[] => {
  const out: BoulderSpec[] = [];
  const count = 2 + (seed % 2);
  for (let i = 0; i < count; i++) {
    const u = hashGrid2D(seed, i);
    const v = hashGrid2D(seed + 7, i);
    const x = (u - 0.5) * 0.6;
    const z = (v - 0.5) * 0.6;
    const radius = 0.05 + hashGrid2D(seed + 13, i) * 0.07;
    out.push({ position: [x, radius * 0.4, z], radius });
  }
  return out;
};

export const getCanyonTileBoulderLayout = (
  gridX: number,
  gridZ: number
): BoulderSpec[] => buildBoulderLayout(hashGrid2D(gridX, gridZ));

export type CanyonBoulderTilePose = {
  gridX: number;
  gridZ: number;
  position: Vector3;
  quaternion: Quaternion;
};

/**
 * The basin-floor pose of every canyon tile: the planet surface at the tile's
 * center lowered to the basin floor, with local +Y along the surface normal —
 * the same pose `CanyonTile` bakes its features against.
 */
export const getCanyonBoulderTilePoses = (
  canyons: Array<{ gridX: number; gridZ: number }>,
  gridSize: number,
  tileSize: number,
  radius: number,
  canyonBBox: CanyonWorldBBox
): CanyonBoulderTilePose[] => {
  const out: CanyonBoulderTilePose[] = [];
  for (const canyon of canyons) {
    if (
      canyon.gridX < 0 ||
      canyon.gridX >= gridSize ||
      canyon.gridZ < 0 ||
      canyon.gridZ >= gridSize
    ) {
      continue;
    }
    const worldX = tileToWorldCoordinate(canyon.gridX, gridSize, tileSize);
    const worldZ = tileToWorldCoordinate(canyon.gridZ, gridSize, tileSize);
    const floorY = sampleBasinFloorY(worldX, worldZ, canyonBBox, radius);
    const { normal } = flatFieldToSphereSurface(worldX, worldZ, radius);
    out.push({
      gridX: canyon.gridX,
      gridZ: canyon.gridZ,
      position: new Vector3(worldX, floorY, worldZ),
      quaternion: getSurfaceQuaternion(normal),
    });
  }
  return out;
};

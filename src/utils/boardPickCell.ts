import { Ray, Sphere, Vector3 } from "three";

import { flatFieldToGridCell } from "./levelEditor";
import { GROUND_POLE_EPSILON } from "./planetSurfaceMapping";
import { CANON_BASIN_DEPTH, type CanyonWorldBBox } from "./canyonBridges";

// The board's north pole sits at world y = -GROUND_POLE_EPSILON (the ground
// sphere is sunk that far below the deck plane). A pointer ray comes from a
// camera above the board, so if the ray's origin is at or below the pole
// plane it cannot hit the board — a free bail before touching the spheres.
const POLE_HEIGHT = -GROUND_POLE_EPSILON;

// Gnomonic inverse: a point on a sphere (center `center`, radius `radius`)
// back to the flat-field plane (y = center.y + radius) — extend the
// center→point ray to that plane. The exact undo of the board's mapping, so a
// hit on the analytic sphere converts to a flat-field coordinate with no
// approximation. `null` for points at the sphere equator (the ray is parallel
// to the field; there is no cell under the horizon).
const spherePointToFlatField = (
  point: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
  radius: number
): { x: number; z: number } | null => {
  const dirY = point.y - center.y;
  if (Math.abs(dirY) < 1e-9) return null;
  const scale = radius / dirY;
  return {
    x: center.x + (point.x - center.x) * scale,
    z: center.z + (point.z - center.z) * scale,
  };
};

// Module-scratch objects, reused across calls so a pointer move allocates
// nothing (the resolver runs on every move over the board).
const scratchRay = new Ray();
const boardSphere = new Sphere();
const bowlSphere = new Sphere();
const scratchPoint = new Vector3();

/**
 * The cell under a pointer ray on the board's pick surface.
 *
 * The board is the cap of the planet sphere, so the entry (first) intersection
 * of the ray with the sphere is the board point the camera sees — for any
 * camera above the board the camera is outside the sphere, and the entry hit
 * is the surface point beneath the cursor. Its gnomonic inverse (center → point
 * extended to the flat-field plane) is the exact undo of the board's mapping,
 * so the hit converts to a flat-field coordinate with no approximation, and
 * the cell comes from the analytic hit, never from the pick mesh's triangles.
 *
 * Canyon cells sit at the basin floor, a bowl the depth of the canyon below the
 * surface. Over the canyon rectangle the floor is flat at the full basin depth,
 * so the bowl is exactly the board sphere translated down by
 * `CANON_BASIN_DEPTH`. There the surface is carved away, so the resolver
 * re-intersects with that bowl and uses the bowl hit's cell instead — the cell
 * under the cursor on the visible floor. The bowl branch runs only while both
 * the surface hit and the bowl hit land inside the canyon rectangle: the
 * surface gate keeps a ray over untouched land from resolving to the bowl (its
 * bowl hit can fall inside the rectangle while the surface hit is outside it —
 * the ray crosses the land rim before reaching the carved floor, so the bowl
 * is not visible); a bowl hit outside the rectangle is below the terrain there,
 * and the surface cell wins. This mirrors the per-tile hitbox the canyon tiles
 * used to carry, which covered exactly the canyon rectangle (not the rim fade).
 *
 * `null` when the ray misses the board entirely or its hit falls past the
 * field edge.
 */
export const resolveBoardPickCell = (
  ray: Ray,
  radius: number,
  gridSize: number,
  tileSize: number,
  canyonBBox: CanyonWorldBBox | null
): { gridX: number; gridZ: number } | null => {
  if (ray.origin.y <= POLE_HEIGHT) return null;

  const centerY = -radius - GROUND_POLE_EPSILON;
  boardSphere.center.set(0, centerY, 0);
  boardSphere.radius = radius;
  scratchRay.copy(ray);

  const boardPoint = scratchRay.intersectSphere(boardSphere, scratchPoint);
  if (!boardPoint) return null;
  const boardPointY = boardPoint.y;

  const flat = spherePointToFlatField(boardPoint, boardSphere.center, radius);
  if (!flat) return null;
  const cell = flatFieldToGridCell(flat.x, flat.z, gridSize, tileSize);
  if (!cell) return null;

  if (canyonBBox) {
    const surfaceInCanyon =
      flat.x >= canyonBBox.minX &&
      flat.x <= canyonBBox.maxX &&
      flat.z >= canyonBBox.minZ &&
      flat.z <= canyonBBox.maxZ;
    if (surfaceInCanyon) {
      bowlSphere.center.set(0, centerY - CANON_BASIN_DEPTH, 0);
      bowlSphere.radius = radius;
      const bowlPoint = scratchRay.intersectSphere(bowlSphere, scratchPoint);
      if (bowlPoint && bowlPoint.y < boardPointY - 1e-4) {
        const bowlFlat = spherePointToFlatField(
          bowlPoint,
          bowlSphere.center,
          radius
        );
        const bowlInCanyon =
          bowlFlat !== null &&
          bowlFlat.x >= canyonBBox.minX &&
          bowlFlat.x <= canyonBBox.maxX &&
          bowlFlat.z >= canyonBBox.minZ &&
          bowlFlat.z <= canyonBBox.maxZ;
        if (bowlInCanyon) {
          const bowlCell = flatFieldToGridCell(
            bowlFlat.x,
            bowlFlat.z,
            gridSize,
            tileSize
          );
          if (bowlCell) return bowlCell;
        }
      }
    }
  }

  return cell;
};

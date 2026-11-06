import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";

import {
  applyRubbleMatrices,
  buildRubbleMatrices,
} from "./PlanetTileDecorations";
import { RUBBLE_MODELS } from "../../constants/models";
import { getPlanetRadius } from "../../utils/planetSurfaceMapping";
import type { TileOccupancyMasks } from "../../utils/tileOccupancy";

const makeOccupancy = (
  gridSize: number,
  pathTiles: { gridX: number; gridZ: number }[] = [],
  waterTiles: { gridX: number; gridZ: number }[] = []
): TileOccupancyMasks => {
  const size = gridSize * gridSize;
  const onPath = new Uint8Array(size);
  const water = new Uint8Array(size);
  for (const tile of pathTiles) {
    onPath[tile.gridZ * gridSize + tile.gridX] = 1;
  }
  for (const tile of waterTiles) {
    water[tile.gridZ * gridSize + tile.gridX] = 1;
  }
  return { gridSize, onPath, water };
};

const GRID_SIZE = 20;
const TILE_SIZE = 1;
// The land slab's full height (public/configs/game.json). Its bottom face sits
// on the sphere surface (radius R); its top face — the visible land surface —
// is a slab-height `pathYOffset` above that, at radius R + pathYOffset.
const PATH_Y_OFFSET = 0.05;
const PLANET_RADIUS = getPlanetRadius(GRID_SIZE, TILE_SIZE);
// `flatFieldToSphereSurface` puts the flat field plane at y = 0.2 (the north
// pole), so the planet center sits at (0, 0.2 - R, 0).
const PLANET_CENTER = new Vector3(0, 0.2 - PLANET_RADIUS, 0);

const positionOf = (matrix: Matrix4): Vector3 =>
  new Vector3().setFromMatrixPosition(matrix);

const scaleOf = (matrix: Matrix4): number => {
  const scale = new Vector3();
  const position = new Vector3();
  const quaternion = new Quaternion();
  matrix.decompose(position, quaternion, scale);
  return scale.x;
};

describe("buildRubbleMatrices (deterministic rubble randomizer)", () => {
  const occupancy = makeOccupancy(GRID_SIZE);

  it("is deterministic: the same level always decorates identically", () => {
    const a = buildRubbleMatrices(occupancy, GRID_SIZE, TILE_SIZE, 0);
    const b = buildRubbleMatrices(occupancy, GRID_SIZE, TILE_SIZE, 0);
    expect(a.length).toBe(RUBBLE_MODELS.length);
    for (let variant = 0; variant < a.length; variant += 1) {
      expect(a[variant].length).toBe(b[variant].length);
      for (let i = 0; i < a[variant].length; i += 1) {
        expect(a[variant][i].elements).toEqual(b[variant][i].elements);
      }
    }
  });

  it("scatters a sparse, non-empty set of props across all variants", () => {
    const perVariant = buildRubbleMatrices(occupancy, GRID_SIZE, TILE_SIZE, 0);
    const total = perVariant.reduce((sum, list) => sum + list.length, 0);
    expect(total).toBeGreaterThan(0);
    // Sparse: far fewer props than free tiles.
    expect(total).toBeLessThan(GRID_SIZE * GRID_SIZE * 0.5);
    // The randomizer spreads props over every variant, not just a few.
    for (const list of perVariant) {
      expect(list.length).toBeGreaterThan(0);
    }
  });

  it("never decorates path or water tiles", () => {
    const pathTiles = [{ gridX: 3, gridZ: 4 }];
    const waterTiles = [{ gridX: 7, gridZ: 12 }];
    const perVariant = buildRubbleMatrices(
      makeOccupancy(GRID_SIZE, pathTiles, waterTiles),
      GRID_SIZE,
      TILE_SIZE,
      0
    );

    // A prop on a marked tile would sit within 0.3 of the tile center (tile
    // is 1 wide): nothing may fall inside the marked tiles' footprint.
    for (const tile of [...pathTiles, ...waterTiles]) {
      const centerX = -(GRID_SIZE * TILE_SIZE) / 2 + tile.gridX + TILE_SIZE / 2;
      const centerZ = -(GRID_SIZE * TILE_SIZE) / 2 + tile.gridZ + TILE_SIZE / 2;
      for (const list of perVariant) {
        for (const matrix of list) {
          const position = positionOf(matrix);
          const distance = Math.hypot(
            position.x - centerX,
            position.z - centerZ
          );
          expect(distance).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it("seats every prop on the land's visible top face with a bounded scale", () => {
    const perVariant = buildRubbleMatrices(
      occupancy,
      GRID_SIZE,
      TILE_SIZE,
      PATH_Y_OFFSET
    );
    for (const list of perVariant) {
      for (const matrix of list) {
        // The model origin (its grounded bottom-center) rests on the land slab's
        // top face — radius R + pathYOffset from the planet center — not buried
        // in the slab or floating above it.
        expect(positionOf(matrix).distanceTo(PLANET_CENTER)).toBeCloseTo(
          PLANET_RADIUS + PATH_Y_OFFSET,
          3
        );
        const scale = scaleOf(matrix);
        expect(scale).toBeGreaterThanOrEqual(0.3);
        expect(scale).toBeLessThanOrEqual(0.55);
      }
    }
  });
});

describe("applyRubbleMatrices (instance refresh)", () => {
  it("refreshes the instance data and recomputes the bounding sphere on every write", () => {
    const mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial(),
      3
    );
    const computeSpy = vi.spyOn(mesh, "computeBoundingSphere");
    const matrices = buildRubbleMatrices(
      makeOccupancy(GRID_SIZE),
      GRID_SIZE,
      TILE_SIZE,
      0
    )[0].slice(0, 3);

    const versionBefore = mesh.instanceMatrix.version;
    applyRubbleMatrices(mesh, matrices);
    expect(computeSpy).toHaveBeenCalledTimes(1);
    // Writing instance data bumps the attribute version so the GPU is re-sent.
    expect(mesh.instanceMatrix.version).toBeGreaterThan(versionBefore);
    // The sphere is actually derived (non-null) after the refresh.
    expect(mesh.boundingSphere).not.toBeNull();

    // Writing again with the same count must refresh again — the renderer
    // culls by this cached sphere, so it cannot go stale when only the
    // matrices change.
    applyRubbleMatrices(mesh, matrices);
    expect(computeSpy).toHaveBeenCalledTimes(2);
  });
});

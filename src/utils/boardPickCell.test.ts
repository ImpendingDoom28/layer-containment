import { describe, expect, it } from "vitest";

import { Ray, Vector3 } from "three";

import { resolveBoardPickCell } from "./boardPickCell";
import { getCanyonWorldBBox, type CanyonWorldBBox } from "./canyonBridges";
import { getPlanetRadius } from "./planetSurfaceMapping";
import type { CanyonConfig } from "../core/types/game";
import { tileToWorldCoordinate } from "./levelEditor";

const GRID = 20;
const TILE = 1;
const RADIUS = getPlanetRadius(GRID, TILE);

// One canyon per cell in a 4×4 block: grid cells 8–11 on both axes, so
// the world bbox is x/z ∈ [-1.5, 2.5] (the cells straddle the field center).
const CANYONS = Array.from({ length: 16 }, (_, i) => {
  const gridX = 8 + (i % 4);
  const gridZ = 8 + Math.floor(i / 4);
  return {
    id: gridX * GRID + gridZ,
    gridX,
    gridZ,
  } satisfies CanyonConfig;
});
const CANYON_BBOX = getCanyonWorldBBox(CANYONS, GRID, TILE);

const tileBBox = (gridX: number, gridZ: number): CanyonWorldBBox => ({
  minX: tileToWorldCoordinate(gridX, GRID, TILE) - TILE / 2,
  maxX: tileToWorldCoordinate(gridX, GRID, TILE) + TILE / 2,
  minZ: tileToWorldCoordinate(gridZ, GRID, TILE) - TILE / 2,
  maxZ: tileToWorldCoordinate(gridZ, GRID, TILE) + TILE / 2,
});

// A pointer ray aimed straight down at the flat-field point (the usual
// board view: camera on the axis above the board, ray nearly vertical).
const verticalRay = (flatX: number, flatZ: number): Ray =>
  new Ray(new Vector3(flatX, 100, flatZ), new Vector3(0, -1, 0));

// A camera above the board, aimed at `target` on the board plane — an
// oblique ray, the case where the bowl hit and the board hit project to
// different flat-field coordinates.
const obliqueRay = (
  origin: [number, number, number],
  target: [number, number, number]
): Ray => {
  const o = new Vector3(...origin);
  return new Ray(o, new Vector3(...target).sub(o).normalize());
};

describe("resolveBoardPickCell", () => {
  it("resolves a ray at the board center to the center cell", () => {
    const cell = resolveBoardPickCell(
      verticalRay(0, 0),
      RADIUS,
      GRID,
      TILE,
      null
    );
    expect(cell).not.toBeNull();
    expect(cell).toEqual({ gridX: 10, gridZ: 10 });
  });

  it("resolves rays over each corner cell to that cell", () => {
    const corners: Array<[number, number]> = [
      [-9.5, -9.5],
      [9.5, -9.5],
      [-9.5, 9.5],
      [9.5, 9.5],
    ];
    for (const [x, z] of corners) {
      const cell = resolveBoardPickCell(
        verticalRay(x, z),
        RADIUS,
        GRID,
        TILE,
        null
      );
      const expected =
        x < 0
          ? z < 0
            ? { gridX: 0, gridZ: 0 }
            : { gridX: 0, gridZ: 19 }
          : z < 0
            ? { gridX: 19, gridZ: 0 }
            : { gridX: 19, gridZ: 19 };
      expect(cell, `corner (${x}, ${z})`).toEqual(expected);
    }
  });

  it("resolves an interior flat-field point to its cell", () => {
    const cell = resolveBoardPickCell(
      verticalRay(0.5, -8.5),
      RADIUS,
      GRID,
      TILE,
      null
    );
    // world (0.5, -8.5) lies in tile x 10, z 1
    expect(cell).toEqual({ gridX: 10, gridZ: 1 });
  });

  it("returns null for a ray that misses the board", () => {
    const miss = resolveBoardPickCell(
      new Ray(new Vector3(0, 100, 0), new Vector3(1, 0, 0)),
      RADIUS,
      GRID,
      TILE,
      null
    );
    expect(miss).toBeNull();
  });

  it("returns null when the hit falls past the field edge", () => {
    const cell = resolveBoardPickCell(
      verticalRay(100, 0),
      RADIUS,
      GRID,
      TILE,
      null
    );
    expect(cell).toBeNull();
  });

  it("returns null for a ray whose origin is below the pole plane", () => {
    const cell = resolveBoardPickCell(
      new Ray(new Vector3(0, -10, 0), new Vector3(0, 1, 0)),
      RADIUS,
      GRID,
      TILE,
      null
    );
    expect(cell).toBeNull();
  });

  it("keeps the surface cell for a vertical ray just outside the canyon rectangle", () => {
    // world z = 2.6 is in tile z 12, one tile past the canyon's edge (z 11)
    const cell = resolveBoardPickCell(
      verticalRay(0, 2.6),
      RADIUS,
      GRID,
      TILE,
      CANYON_BBOX
    );
    expect(cell).toEqual({ gridX: 10, gridZ: 12 });
  });

  it("resolves an oblique ray over the canyon to the bowl cell", () => {
    // Camera above the board, aimed into the canyon. The board sphere's hit
    // projects to cell (10, 10), but the bowl hit — the point under the
    // cursor on the basin floor — lands in cell (10, 11).
    const cell = resolveBoardPickCell(
      obliqueRay([0, 300, -100], [0, 0.2, 0.5]),
      RADIUS,
      GRID,
      TILE,
      CANYON_BBOX
    );
    const boardCell = resolveBoardPickCell(
      obliqueRay([0, 300, -100], [0, 0.2, 0.5]),
      RADIUS,
      GRID,
      TILE,
      null
    );
    expect(boardCell).toEqual({ gridX: 10, gridZ: 10 });
    expect(cell).toEqual({ gridX: 10, gridZ: 11 });
  });

  it("keeps the surface cell when the surface hit is outside the canyon rectangle", () => {
    // An oblique ray aimed just up (north) of the canyon: the bowl hit lands
    // inside the rectangle (cell (10, 8)), but the surface hit is outside it
    // — the cursor is over the land rim, where the bowl is not visible. The
    // surface cell (10, 7) wins.
    const cell = resolveBoardPickCell(
      obliqueRay([0, 300, -100], [0, 0.2, -2.5]),
      RADIUS,
      GRID,
      TILE,
      CANYON_BBOX
    );
    expect(cell).toEqual({ gridX: 10, gridZ: 7 });
  });

  it("keeps the surface cell when the bowl hit lands outside the canyon rectangle", () => {
    // A single-cell canyon at (10, 10). An oblique ray aimed near its south
    // rim: the bowl hit projects past the rectangle (cell (10, 12) — under
    // the terrain there), so the visible surface point's cell (10, 11) wins.
    const bbox = tileBBox(10, 10);
    const ray = obliqueRay([0, 500, -150], [0, 0.2, 1.9]);
    const cell = resolveBoardPickCell(ray, RADIUS, GRID, TILE, bbox);
    const boardCell = resolveBoardPickCell(ray, RADIUS, GRID, TILE, null);
    expect(boardCell).toEqual({ gridX: 10, gridZ: 11 });
    expect(cell).toEqual({ gridX: 10, gridZ: 11 });
  });
});

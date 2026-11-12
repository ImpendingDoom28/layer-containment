import { describe, expect, it } from "vitest";

import type { CanyonConfig, PathWaypoint } from "../core/types/game";
import {
  BRIDGE_ELEVATION,
  CANON_BASIN_DEPTH,
  CANON_BASIN_RIM_FADE,
  buildCanyonBridgePaths,
  buildCanyonMask,
  findBridgeCrossings,
  isBridgeCrossing,
  getBasinCapBBox,
  getBridgeTiles,
  getCanyonWorldBBox,
  pathCanyonTiles,
  sampleBasinFloorY,
} from "./canyonBridges";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
} from "./planetSurfaceMapping";
import { tileToWorldCoordinate } from "./levelEditor";

const GRID = 20;
const TILE = 1;
const RADIUS = getPlanetRadius(GRID, TILE);

const surfaceY = (x: number, z: number) =>
  flatFieldToSphereSurface(x, z, RADIUS).surfacePoint.y;

const wp = (gridX: number, gridZ: number): PathWaypoint => ({
  x: tileToWorldCoordinate(gridX, GRID, TILE),
  y: 0,
  z: tileToWorldCoordinate(gridZ, GRID, TILE),
});

const column = (gridX: number, gridZStart: number, count: number) =>
  Array.from({ length: count }, (_, i) => wp(gridX, gridZStart + i));

const canyon = (gridX: number, gridZ: number, id?: number): CanyonConfig => ({
  id: id ?? gridX * GRID + gridZ,
  gridX,
  gridZ,
});

describe("buildCanyonMask", () => {
  it("marks only the given canyon tiles", () => {
    const mask = buildCanyonMask([canyon(3, 4), canyon(9, 9)], GRID);
    expect(mask[4 * GRID + 3]).toBe(1);
    expect(mask[9 * GRID + 9]).toBe(1);
    expect(mask[0]).toBe(0);
    expect(mask[GRID * GRID - 1]).toBe(0);
  });
});

describe("buildCanyonBridgePaths", () => {
  it("returns the input unchanged when there are no canyons", () => {
    const path = column(5, 2, 10);
    const paths = [path];
    expect(buildCanyonBridgePaths(paths, [], GRID, TILE)).toBe(paths);
  });

  it("keeps the bridge span flush with the ground (no elevation)", () => {
    // Path runs down column 9; a 3-tile canyon at gridZ 8..10 (gridX 9).
    const path = column(9, 4, 12); // gridZ 4..15
    const canyons = [canyon(9, 8), canyon(9, 9), canyon(9, 10)];
    const [result] = buildCanyonBridgePaths([path], canyons, GRID, TILE);

    // The run tiles sit flush at the bridge level (ground)...
    expect(result[8 - 4].y).toBe(BRIDGE_ELEVATION);
    expect(result[9 - 4].y).toBe(BRIDGE_ELEVATION);
    expect(result[10 - 4].y).toBe(BRIDGE_ELEVATION);

    // ...and so does the rest of the path — crossing the canyon no longer
    // raises the walkway, so the whole span is at ground level.
    expect(result.every((point) => point.y === BRIDGE_ELEVATION)).toBe(true);
  });

  it("preserves path shape and length when bridging", () => {
    const path = column(9, 4, 12);
    const canyons = [canyon(9, 8), canyon(9, 9), canyon(9, 10)];
    const [result] = buildCanyonBridgePaths([path], canyons, GRID, TILE);
    // Same tile count (resampled per tile) and identical x/z footprint.
    expect(result).toHaveLength(path.length);
    result.forEach((point, i) => {
      expect(point.x).toBe(path[i].x);
      expect(point.z).toBe(path[i].z);
    });
  });

  it("keeps the path flat when it does not cross the canyon", () => {
    const path = column(15, 4, 12); // far from the canyon column
    const canyons = [canyon(9, 8), canyon(9, 9), canyon(9, 10)];
    const [result] = buildCanyonBridgePaths([path], canyons, GRID, TILE);
    expect(result.every((point) => point.y === 0)).toBe(true);
  });

  it("returns non-canyon paths unchanged even when the level has canyons", () => {
    // Authored coordinates are preserved (off-center x, nonzero y) instead of
    // being re-sampled to tile centers just because some other path bridges a
    // canyon.
    const authored: PathWaypoint[] = [
      { x: 4.3, y: 2.5, z: -3.1 },
      { x: 4.3, y: 2.5, z: 5.2 },
    ];
    const canyons = [canyon(9, 8), canyon(9, 9), canyon(9, 10)];
    const [result] = buildCanyonBridgePaths([authored], canyons, GRID, TILE);
    expect(result).toBe(authored);
  });

  it("re-samples only the paths that actually cross a canyon", () => {
    const crossing = column(9, 4, 12); // over the canyon column
    const off = column(15, 4, 12); // far from it
    const canyons = [canyon(9, 8), canyon(9, 9), canyon(9, 10)];
    const [resultCrossing, resultOff] = buildCanyonBridgePaths(
      [crossing, off],
      canyons,
      GRID,
      TILE
    );
    expect(resultCrossing).toHaveLength(crossing.length);
    expect(resultCrossing[4].y).toBe(BRIDGE_ELEVATION); // canyon tile
    expect(resultOff).toBe(off);
  });
});

describe("getBridgeTiles", () => {
  it("returns one tile per canyon cell the path crosses, tagged with run ends", () => {
    const path = column(9, 4, 12);
    const canyons = [canyon(9, 8), canyon(9, 9), canyon(9, 10)];
    const tiles = getBridgeTiles(path, canyons, GRID, TILE);

    expect(tiles).toHaveLength(3);
    expect(tiles.map((t) => t.gridZ)).toEqual([8, 9, 10]);
    expect(tiles[0].isRunStart).toBe(true);
    expect(tiles[0].isRunEnd).toBe(false);
    expect(tiles[2].isRunStart).toBe(false);
    expect(tiles[2].isRunEnd).toBe(true);
    // Direction is along the path (down +z here).
    expect(tiles[1].dirZ).toBeCloseTo(1);
    expect(tiles[1].dirX).toBeCloseTo(0);
  });

  it("returns no tiles when the path avoids the canyon", () => {
    const path = column(15, 4, 12);
    const canyons = [canyon(9, 8), canyon(9, 9), canyon(9, 10)];
    expect(getBridgeTiles(path, canyons, GRID, TILE)).toHaveLength(0);
  });
});

// A rectangular block of canyon cells, gridX x0..x1 × gridZ z0..z1.
const block = (
  x0: number,
  x1: number,
  z0: number,
  z1: number
): CanyonConfig[] => {
  const out: CanyonConfig[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      out.push(canyon(x, z));
    }
  }
  return out;
};

describe("getCanyonWorldBBox", () => {
  it("returns the exact union of the canyon cells' world edges", () => {
    // A single cell at grid (3,4): center (-6.5, -5.5), edges ±0.5.
    const bbox = getCanyonWorldBBox([canyon(3, 4)], GRID, TILE);
    expect(bbox).toEqual({ minX: -7, maxX: -6, minZ: -6, maxZ: -5 });
  });

  it("spans the whole block for a multi-cell canyon", () => {
    // 4×4 at gridX 6..9 × gridZ 8..11 → x −4..0, z −2..2.
    const bbox = getCanyonWorldBBox(block(6, 9, 8, 11), GRID, TILE);
    expect(bbox).toEqual({ minX: -4, maxX: 0, minZ: -2, maxZ: 2 });
  });

  it("skips out-of-grid cells", () => {
    // A cell at the grid edge (gridX = GRID) is ignored.
    const bbox = getCanyonWorldBBox(
      [canyon(3, 4), canyon(GRID, 4), canyon(3, GRID)],
      GRID,
      TILE
    );
    expect(bbox).toEqual({ minX: -7, maxX: -6, minZ: -6, maxZ: -5 });
  });

  it("returns null when there are no canyons", () => {
    expect(getCanyonWorldBBox([], GRID, TILE)).toBeNull();
  });
});

describe("getBasinCapBBox", () => {
  it("expands the canyon bbox by the bank width on every side", () => {
    const bbox = { minX: -4, maxX: 0, minZ: -2, maxZ: 2 };
    expect(getBasinCapBBox(bbox)).toEqual({
      minX: -4 - CANON_BASIN_RIM_FADE,
      maxX: 0 + CANON_BASIN_RIM_FADE,
      minZ: -2 - CANON_BASIN_RIM_FADE,
      maxZ: 2 + CANON_BASIN_RIM_FADE,
    });
  });
});

describe("sampleBasinFloorY", () => {
  const bbox = { minX: -4, maxX: 0, minZ: -2, maxZ: 2 };
  const center = { x: -2, z: 0 };
  // The depth below the surface (positive = lower than the land).
  const depthAt = (x: number, z: number) =>
    surfaceY(x, z) - sampleBasinFloorY(x, z, bbox, RADIUS);

  it("sits a full depth below the surface at the canyon center", () => {
    expect(depthAt(center.x, center.z)).toBeCloseTo(CANON_BASIN_DEPTH, 5);
  });

  it("sits at the surface just beyond the bank", () => {
    // One bank-width past the edge (x = maxX + RIM_FADE) the S-curve has
    // eased back to the land.
    const x = bbox.maxX + CANON_BASIN_RIM_FADE;
    expect(depthAt(x, center.z)).toBeCloseTo(0, 5);
  });

  it("equals the surface outside the basin", () => {
    // Far outside the rectangle plus bank.
    expect(depthAt(bbox.maxX + 5, center.z)).toBeCloseTo(0, 5);
    expect(depthAt(center.x, bbox.minZ - 5)).toBeCloseTo(0, 5);
  });

  it("eases monotonically from the floor to the land", () => {
    // Walking out from the edge, the depth never increases.
    const xs = [
      bbox.maxX,
      bbox.maxX + 0.25,
      bbox.maxX + 0.5,
      bbox.maxX + 0.75,
      bbox.maxX + CANON_BASIN_RIM_FADE,
      bbox.maxX + 1.5,
    ];
    const depths = xs.map((x) => depthAt(x, center.z));
    depths.forEach((d, i) => {
      if (i > 0) expect(d).toBeLessThanOrEqual(depths[i - 1] + 1e-9);
    });
    expect(depths[0]).toBeCloseTo(CANON_BASIN_DEPTH, 5);
    expect(depths[depths.length - 1]).toBeCloseTo(0, 5);
  });

  it("is a flat bottom across the whole rectangle", () => {
    // Every point inside the bbox is at the full depth (rectangular hull).
    for (const x of [bbox.minX, (bbox.minX + bbox.maxX) / 2, bbox.maxX]) {
      for (const z of [bbox.minZ, (bbox.minZ + bbox.maxZ) / 2, bbox.maxZ]) {
        expect(depthAt(x, z)).toBeCloseTo(CANON_BASIN_DEPTH, 5);
      }
    }
  });

  it("uses the union bbox for multiple canyons", () => {
    // Two separated canyons: the basin spans the rectangle between them, so
    // the gap is also carved to the full depth (rectangular-hull semantics).
    const multi = getCanyonWorldBBox(
      [canyon(3, 4), canyon(10, 4)],
      GRID,
      TILE
    )!;
    expect(multi.minX).toBe(-7);
    expect(multi.maxX).toBe(1);
    const gapX = (multi.minX + multi.maxX) / 2;
    const gapZ = (multi.minZ + multi.maxZ) / 2;
    expect(
      surfaceY(gapX, gapZ) - sampleBasinFloorY(gapX, gapZ, multi, RADIUS)
    ).toBeCloseTo(CANON_BASIN_DEPTH, 5);
  });
});

describe("pathCanyonTiles", () => {
  it("lists the canyon tiles a path crosses, with segment direction", () => {
    const path = column(5, 2, 4); // tiles (5,2),(5,3),(5,4),(5,5)
    expect(
      pathCanyonTiles(path, [canyon(5, 3), canyon(5, 4)], GRID, TILE)
    ).toEqual([
      { gridX: 5, gridZ: 3, dirX: 0, dirZ: 1 },
      { gridX: 5, gridZ: 4, dirX: 0, dirZ: 1 },
    ]);
  });

  it("is empty when the path avoids every canyon", () => {
    const path = column(5, 2, 3);
    expect(pathCanyonTiles(path, [canyon(9, 9)], GRID, TILE)).toEqual([]);
  });
});

describe("isBridgeCrossing", () => {
  it("treats perpendicular spans as crossing", () => {
    expect(isBridgeCrossing({ dirX: 1, dirZ: 0 }, { dirX: 0, dirZ: 1 })).toBe(
      true
    );
    expect(isBridgeCrossing({ dirX: -1, dirZ: 0 }, { dirX: 0, dirZ: -1 })).toBe(
      true
    );
  });

  it("treats collinear spans (merge) as not crossing", () => {
    expect(isBridgeCrossing({ dirX: 1, dirZ: 0 }, { dirX: 1, dirZ: 0 })).toBe(
      false
    );
    expect(isBridgeCrossing({ dirX: 1, dirZ: 0 }, { dirX: -1, dirZ: 0 })).toBe(
      false
    );
  });
});

describe("findBridgeCrossings", () => {
  it("reports two paths crossing the same canyon tile at a right angle", () => {
    const vertical = column(5, 2, 5); // down column 5, tiles z=2..6
    const horizontal = [wp(2, 4), wp(3, 4), wp(4, 4), wp(5, 4), wp(6, 4)];
    const crossings = findBridgeCrossings(
      [vertical, horizontal],
      [canyon(5, 4)],
      GRID,
      TILE
    );
    expect(crossings).toEqual([
      {
        pathIndexA: 0,
        pathIndexB: 1,
        tiles: [{ gridX: 5, gridZ: 4 }],
      },
    ]);
  });

  it("does not report collinear paths merging over the same canyon tiles", () => {
    const a = column(5, 2, 5); // tiles z=2..6
    const b = column(5, 4, 5); // tiles z=4..8, same direction
    const crossings = findBridgeCrossings(
      [a, b],
      [canyon(5, 4), canyon(5, 5)],
      GRID,
      TILE
    );
    expect(crossings).toEqual([]);
  });

  it("reports no crossing when the bridges share no canyon tile", () => {
    const a = column(5, 2, 3);
    const b = column(6, 2, 3);
    expect(
      findBridgeCrossings([a, b], [canyon(5, 3), canyon(6, 3)], GRID, TILE)
    ).toEqual([]);
  });

  it("ignores ground-level crossings (no canyon at the crossing tile)", () => {
    const vertical = column(5, 2, 5);
    const horizontal = [wp(2, 4), wp(6, 4)];
    // Crossing at (5,4), but no canyon there -> not a bridge crossing.
    expect(findBridgeCrossings([vertical, horizontal], [], GRID, TILE)).toEqual(
      []
    );
  });
});

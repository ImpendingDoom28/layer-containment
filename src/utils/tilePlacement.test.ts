import { describe, expect, it } from "vitest";

import type { Building, Tower } from "../core/types/game";
import { getLevelGridOffset } from "./levelEditor";
import { createTileBlockage, getTilePlacementState } from "./tilePlacement";

const GRID_SIZE = 4;
const TILE_SIZE = 1;
const PATH_WIDTH = 1;
const GRID_OFFSET = getLevelGridOffset(GRID_SIZE, TILE_SIZE);

// A straight path along world z = -1.5 (tile (gridX, gridZ) centers on
// (offset + gridX + 0.5, ...)). With PATH_WIDTH = 1 it marks tiles (0,0),
// (1,0) — the segment's own row — and (0,1), (1,1), whose corners sit exactly
// half a path width from the segment.
const PATH_WAYPOINTS = [
  [
    { x: -1.5, y: 0, z: -1.5 },
    { x: -0.5, y: 0, z: -1.5 },
  ],
];

const makeBuilding = (gridX: number, gridZ: number): Building => ({
  id: 1,
  gridX,
  gridZ,
  x: gridX,
  z: gridZ,
  shape: "box",
  width: 0.8,
  depth: 0.8,
  height: 1.8,
  color: "#fff",
});

const makeTower = (gridX: number, gridZ: number): Tower => ({
  id: 1,
  type: "basic",
  name: "basic",
  cost: 10,
  damage: 1,
  range: 2,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 5,
  color: "#fff",
  description: "",
  model: { url: "assets/models/tower_basic.glb", node: "Tower_Basic_ROOT" },
  muzzle: { turretNode: "Azimuth", muzzle: { x: 0, y: 0.3731, z: 1.071 } },
  lastFireTime: 0,
  gridX,
  gridZ,
  x: gridX,
  z: gridZ,
});

const blockage = createTileBlockage({
  gridSize: GRID_SIZE,
  gridOffset: GRID_OFFSET,
  tileSize: TILE_SIZE,
  pathWaypoints: PATH_WAYPOINTS,
  pathWidth: PATH_WIDTH,
  buildings: [makeBuilding(3, 3)],
  waters: [{ id: 1, gridX: 2, gridZ: 2 }],
  canyons: [{ id: 1, gridX: 1, gridZ: 3 }],
});

describe("createTileBlockage", () => {
  it("marks the static tiles: path, water, canyon, building", () => {
    expect(blockage.onPath[0 * GRID_SIZE + 0]).toBe(1);
    expect(blockage.onPath[1 * GRID_SIZE + 0]).toBe(1);
    expect(blockage.onPath[1 * GRID_SIZE + 1]).toBe(1);
    expect(blockage.water[2 * GRID_SIZE + 2]).toBe(1);
    expect(blockage.canyon[3 * GRID_SIZE + 1]).toBe(1);
    expect(blockage.building[3 * GRID_SIZE + 3]).toBe(1);
  });

  it("leaves unrelated tiles free", () => {
    // (3,1) is far from the path (its closest corner is >1.5 from the segment).
    const state = getTilePlacementState({
      gridX: 3,
      gridZ: 1,
      blockage,
      towers: [],
    });
    expect(state).toEqual({
      isOccupiedByTower: false,
      isOccupiedByBuilding: false,
      isOnPath: false,
      isWater: false,
      isCanyon: false,
      isBlocked: false,
    });
  });
});

describe("getTilePlacementState with precomputed blockage", () => {
  it("reports each static source", () => {
    expect(getTilePlacementState({ gridX: 0, gridZ: 0, blockage, towers: [] })
      .isOnPath).toBe(true);
    expect(getTilePlacementState({ gridX: 2, gridZ: 2, blockage, towers: [] })
      .isWater).toBe(true);
    expect(getTilePlacementState({ gridX: 1, gridZ: 3, blockage, towers: [] })
      .isCanyon).toBe(true);
    expect(
      getTilePlacementState({ gridX: 3, gridZ: 3, blockage, towers: [] })
        .isOccupiedByBuilding
    ).toBe(true);
  });

  it("keeps tower occupancy dynamic", () => {
    const occupied = getTilePlacementState({
      gridX: 3,
      gridZ: 1,
      blockage,
      towers: [makeTower(3, 1)],
    });
    expect(occupied.isOccupiedByTower).toBe(true);
    expect(occupied.isBlocked).toBe(true);

    const freeAgain = getTilePlacementState({
      gridX: 3,
      gridZ: 1,
      blockage,
      towers: [makeTower(2, 1)],
    });
    expect(freeAgain.isOccupiedByTower).toBe(false);
    expect(freeAgain.isBlocked).toBe(false);
  });

  it("treats a null blockage as having no static tiles (pre-load state)", () => {
    const state = getTilePlacementState({
      gridX: 0,
      gridZ: 0,
      blockage: null,
      towers: [],
    });
    expect(state.isBlocked).toBe(false);
    expect(state.isOnPath).toBe(false);
  });

  it("never throws or reports blocked for out-of-bounds tiles", () => {
    const state = getTilePlacementState({
      gridX: 99,
      gridZ: 99,
      blockage,
      towers: [],
    });
    expect(state.isBlocked).toBe(false);
  });
});

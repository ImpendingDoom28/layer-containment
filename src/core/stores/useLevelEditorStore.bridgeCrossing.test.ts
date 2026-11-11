import { afterEach, describe, expect, it } from "vitest";

import type { LevelConfigData } from "../configs/levelConfig";
import { useLevelEditorStore } from "./useLevelEditorStore";

const TILE_SIZE = 1;
const PATH_WIDTH = 0.85;
const GRID = 10;

// Grid (gx, gz) -> its tile-center world coordinate for a 10x10 grid,
// tileSize 1: getLevelGridOffset(-5) + g + tileSize/2 = g - 4.5.
const wp = (gx: number, gz: number) => ({
  x: gx - GRID / 2 + TILE_SIZE / 2,
  y: 0,
  z: gz - GRID / 2 + TILE_SIZE / 2,
});

// Vertical path down column 5, world x = 0, z from -3 to 3.
const CROSSING_LEVEL: LevelConfigData = {
  name: "bridge test",
  label: "Bridge Test",
  description: "Two paths over a canyon.",
  startingHealth: 20,
  startingMoney: 100,
  gridSize: GRID,
  waters: [],
  canyons: [{ id: 1, gridX: 5, gridZ: 5 }],
  pathWaypoints: [[wp(5, 2), wp(5, 8)]],
  waveConfigs: [
    {
      totalEnemies: 10,
      enemies: [{ type: "basic", count: 10, spawnInterval: 1 }],
    },
  ],
  buildings: [],
  towers: [],
  enemies: [],
  projectiles: [],
  enemyWeights: null,
};

// Like CROSSING_LEVEL but no canyon, so the ground crossing is legal.
const GROUND_LEVEL: LevelConfigData = {
  ...CROSSING_LEVEL,
  canyons: [],
  pathWaypoints: [[wp(5, 2), wp(5, 8)]],
};

const store = () => useLevelEditorStore.getState();

const startPath = (
  pathIndex: number,
  start: { gridX: number; gridZ: number }
) => {
  store().setActiveTool("drawPath");
  store().selectPath(pathIndex);
  store().handleTileAction(start, TILE_SIZE, PATH_WIDTH);
};

afterEach(() => {
  useLevelEditorStore.getState().resetDraftLevel();
});

describe("useLevelEditorStore: bridge crossing rule", () => {
  it("blocks drawing a segment that crosses another path's bridge", () => {
    store().loadDraftLevel(CROSSING_LEVEL, TILE_SIZE);
    startPath(1, { gridX: 2, gridZ: 5 });
    // Path 1 is now [(2,5)]; drawing to (6,5) crosses path 0's bridge at (5,5).
    store().handleTileAction({ gridX: 6, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[1]).toHaveLength(1);
  });

  it("blocks a straight segment that crosses the bridge mid-segment", () => {
    store().loadDraftLevel(CROSSING_LEVEL, TILE_SIZE);
    startPath(1, { gridX: 2, gridZ: 5 });
    // The crossing at (5,5) is mid-segment, not on the target waypoint (6,5).
    store().handleTileAction({ gridX: 6, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[1]).toEqual([wp(2, 5)]);
  });

  it("allows a collinear merge over the same canyon tiles", () => {
    store().loadDraftLevel(CROSSING_LEVEL, TILE_SIZE);
    // Path 0 is the vertical bridge [ (5,2) -> (5,8) ]. Draw a second, new
    // path 1 also running down column 5, sharing the canyon tile (5,5) with
    // path 0 in the same direction — a merge over the bridge, not a crossing,
    // so it is allowed.
    startPath(1, { gridX: 5, gridZ: 3 });
    store().handleTileAction({ gridX: 5, gridZ: 6 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[1]).toEqual([wp(5, 3), wp(5, 6)]);
  });

  it("still allows a ground-level crossing (no canyon at the crossing tile)", () => {
    store().loadDraftLevel(GROUND_LEVEL, TILE_SIZE);
    startPath(1, { gridX: 2, gridZ: 5 });
    store().handleTileAction({ gridX: 6, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[1]).toEqual([wp(2, 5), wp(6, 5)]);
  });

  it("blocks dragging a waypoint so its segment crosses a bridge", () => {
    store().loadDraftLevel(CROSSING_LEVEL, TILE_SIZE);
    startPath(1, { gridX: 2, gridZ: 5 });
    store().handleTileAction({ gridX: 4, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[1]).toEqual([wp(2, 5), wp(4, 5)]);
    // Drag path 1's last waypoint from (4,5) to (6,5): the new segment
    // crosses path 0's bridge at (5,5).
    store().selectWaypoint(1, 1);
    store().updateSelectedWaypoint({ gridX: 6, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[1]).toEqual([wp(2, 5), wp(4, 5)]);
  });

  it("blocks moving the spawn endpoint across a bridge", () => {
    store().loadDraftLevel(CROSSING_LEVEL, TILE_SIZE);
    startPath(1, { gridX: 2, gridZ: 5 });
    store().handleTileAction({ gridX: 4, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    // Move path 1's spawn from (2,5) to (6,5): the segment (6,5)->(4,5)
    // crosses path 0's bridge at (5,5).
    store().setActiveTool("setSpawn");
    store().selectPath(1);
    store().handleTileAction({ gridX: 6, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[1]).toEqual([wp(2, 5), wp(4, 5)]);
  });

  it("blocks moving the base endpoint across a bridge", () => {
    store().loadDraftLevel(CROSSING_LEVEL, TILE_SIZE);
    startPath(1, { gridX: 2, gridZ: 5 });
    store().handleTileAction({ gridX: 4, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    // Move path 1's base from (4,5) to (6,5): the segment (2,5)->(6,5)
    // crosses path 0's bridge at (5,5).
    store().setActiveTool("setBase");
    store().selectPath(1);
    store().handleTileAction({ gridX: 6, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[1]).toEqual([wp(2, 5), wp(4, 5)]);
  });

  // The user-reported grid: two vertical paths and two horizontal paths all
  // spanning a large multi-tile canyon basin (not a single tile). A single
  // horizontal path crossing a vertical bridge mid-segment must be blocked,
  // so the 2x2 grid of overlapping bridge rails cannot be built by drawing.
  it("blocks drawing the user-reported grid over a multi-tile basin", () => {
    const basin: LevelConfigData = {
      ...CROSSING_LEVEL,
      canyons: [
        { id: 1, gridX: 4, gridZ: 4 },
        { id: 2, gridX: 5, gridZ: 4 },
        { id: 3, gridX: 6, gridZ: 4 },
        { id: 4, gridX: 4, gridZ: 5 },
        { id: 5, gridX: 5, gridZ: 5 },
        { id: 6, gridX: 6, gridZ: 5 },
        { id: 7, gridX: 4, gridZ: 6 },
        { id: 8, gridX: 5, gridZ: 6 },
        { id: 9, gridX: 6, gridZ: 6 },
      ],
      // Path 0: vertical bridge down column 5 over the basin.
      pathWaypoints: [[wp(5, 2), wp(5, 8)]],
    };
    store().loadDraftLevel(basin, TILE_SIZE);

    // Path 1: second vertical path down column 7 — parallel, no crossing.
    startPath(1, { gridX: 7, gridZ: 2 });
    store().handleTileAction({ gridX: 7, gridZ: 8 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[1]).toEqual([wp(7, 2), wp(7, 8)]);

    // Path 2: horizontal path crossing path 0's bridge at (5,5) — the first
    // crossing; must be blocked outright.
    startPath(2, { gridX: 2, gridZ: 5 });
    store().handleTileAction({ gridX: 6, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[2]).toHaveLength(1);

    // Path 3: a horizontal path whose segment would only cross path 0's
    // bridge at (5,6) (still inside the basin) — also blocked.
    startPath(3, { gridX: 2, gridZ: 6 });
    store().handleTileAction({ gridX: 6, gridZ: 6 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.pathWaypoints[3]).toHaveLength(1);

    // And a basin tile is never paintable under an existing path, so the
    // "draw the paths first, then carve the basin underneath" route is closed
    // as well.
    store().setActiveTool("canyon");
    const before = store().draftLevel.canyons.length;
    store().handleTileAction({ gridX: 5, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.canyons).toHaveLength(before);
  });
});

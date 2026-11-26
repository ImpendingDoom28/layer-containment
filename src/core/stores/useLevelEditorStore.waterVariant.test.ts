import { afterEach, describe, expect, it, vi } from "vitest";

import type { LevelConfigData } from "../configs/levelConfig";
import { useLevelEditorStore } from "./useLevelEditorStore";

// Water painting resolves a default color through the browser CSS cache
// (getComputedStyle), which the node test environment has no `document` for.
vi.mock("../../components/ui/lib/cssUtils", () => ({
  getCssColorValue: () => "#0e7490",
}));

const TILE_SIZE = 1;
const PATH_WIDTH = 0.85;
const GRID = 10;

const wp = (gx: number, gz: number) => ({
  x: gx - GRID / 2 + TILE_SIZE / 2,
  y: 0,
  z: gz - GRID / 2 + TILE_SIZE / 2,
});

const makeLevel = (waters: LevelConfigData["waters"] = []): LevelConfigData => ({
  name: "water variant test",
  label: "Water Variant",
  description: "Water variant tests.",
  startingHealth: 20,
  startingMoney: 100,
  gridSize: GRID,
  waters,
  canyons: [],
  pathWaypoints: [[wp(0, 0), wp(9, 0)]],
  waveConfigs: [
    { totalEnemies: 1, enemies: [{ type: "basic", count: 1, spawnInterval: 1 }] },
  ],
  buildings: [],
  towers: [],
  enemies: [],
  projectiles: [],
  quests: [],
  enemyWeights: null,
});

const store = () => useLevelEditorStore.getState();

afterEach(() => {
  store().resetDraftLevel();
  store().setWaterVariant("full");
});

describe("useLevelEditorStore water variant rotation", () => {
  it("wraps the four edge halves clockwise", () => {
    for (const [from, to] of [
      ["half-n", "half-e"],
      ["half-e", "half-s"],
      ["half-s", "half-w"],
      ["half-w", "half-n"],
    ] as const) {
      store().setWaterVariant(from);
      store().rotateWaterVariant();
      expect(store().waterVariant).toBe(to);
    }
  });

  it("wraps the four corners clockwise", () => {
    for (const [from, to] of [
      ["corner-nw", "corner-ne"],
      ["corner-ne", "corner-se"],
      ["corner-se", "corner-sw"],
      ["corner-sw", "corner-nw"],
    ] as const) {
      store().setWaterVariant(from);
      store().rotateWaterVariant();
      expect(store().waterVariant).toBe(to);
    }
  });

  it("wraps the edge-half cycle back to the start", () => {
    store().setWaterVariant("half-n");
    for (let i = 0; i < 3; i += 1) {
      store().rotateWaterVariant();
    }
    expect(store().waterVariant).toBe("half-w");
    store().rotateWaterVariant();
    expect(store().waterVariant).toBe("half-n");
  });

  it("leaves the full tile unchanged when rotating", () => {
    store().setWaterVariant("full");
    store().rotateWaterVariant();
    expect(store().waterVariant).toBe("full");
  });
});

describe("useLevelEditorStore water painting", () => {
  it("paints a water tile with the selected variant", () => {
    store().loadDraftLevel(makeLevel(), TILE_SIZE);
    store().setActiveTool("water");
    store().setWaterVariant("corner-ne");
    // (5,5) is off the path row (0).
    store().handleTileAction({ gridX: 5, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    const painted = store().draftLevel.waters.find(
      (w) => w.gridX === 5 && w.gridZ === 5
    );
    expect(painted).toBeDefined();
    expect(painted?.variant).toBe("corner-ne");
  });

  it("paints a full-tile water when the variant is full", () => {
    store().loadDraftLevel(makeLevel(), TILE_SIZE);
    store().setActiveTool("water");
    store().setWaterVariant("full");
    store().handleTileAction({ gridX: 6, gridZ: 5 }, TILE_SIZE, PATH_WIDTH);
    const painted = store().draftLevel.waters.find(
      (w) => w.gridX === 6 && w.gridZ === 5
    );
    expect(painted).toBeDefined();
    expect(painted?.variant).toBe("full");
  });

  it("still toggles: clicking an existing water tile removes it", () => {
    store().loadDraftLevel(makeLevel(), TILE_SIZE);
    store().setActiveTool("water");
    store().setWaterVariant("half-s");
    const tile = { gridX: 7, gridZ: 5 };
    store().handleTileAction(tile, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.waters.length).toBe(1);
    store().handleTileAction(tile, TILE_SIZE, PATH_WIDTH);
    expect(store().draftLevel.waters.length).toBe(0);
  });
});

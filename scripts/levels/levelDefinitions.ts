import type {
  LevelBuildingSpec,
  LevelDefinition,
  LevelWaterSpec,
} from "../../src/utils/levelBuilder";
import type { WaveEnemyGroup } from "../../src/core/types/game";

type WaveGroup = WaveEnemyGroup;

/** Build an enemy group entry for a wave. */
export const g = (
  type: WaveGroup["type"],
  count: number,
  spawnInterval: number
): WaveGroup => ({ type, count, spawnInterval });

/** Build an unbuildable ruin/obstacle (a building) at a grid cell. */
export const building = (
  gridX: number,
  gridZ: number,
  shape: LevelBuildingSpec["shape"],
  width: number,
  depth: number,
  height: number,
  color: string
): LevelBuildingSpec => ({ gridX, gridZ, shape, width, depth, height, color });

/** Build a water (contamination) tile at a grid cell. */
export const water = (gridX: number, gridZ: number): LevelWaterSpec => ({
  gridX,
  gridZ,
});

// Level definitions in grid coordinates. Each entry is one playable level.
export const LEVELS: Record<string, LevelDefinition> = {
  // Sector 2 "The Convergence": two gates (top-left / top-right) that converge
  // into a shared final corridor to a single core, so towers on the corridor
  // hit both fronts. Ruins + corner contamination split the map.
  level_2: {
    name: "2",
    startingMoney: 200,
    gridSize: 20,
    paths: [
      [
        [3, 0],
        [3, 4],
        [7, 4],
        [7, 8],
        [3, 8],
        [3, 12],
        [9, 12],
        [9, 16],
        [9, 19],
      ],
      [
        [16, 0],
        [16, 4],
        [12, 4],
        [12, 8],
        [16, 8],
        [16, 12],
        [9, 12],
        [9, 16],
        [9, 19],
      ],
    ],
    buildings: [
      building(5, 2, "box", 0.9, 0.9, 2.2, "#8b7355"),
      building(14, 2, "cylinder", 0.8, 0.8, 1.9, "#6b7280"),
      building(5, 6, "box", 0.86, 0.86, 2.1, "#78716c"),
      building(14, 6, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
      building(9, 6, "box", 0.9, 0.9, 2.3, "#8b7355"),
      building(9, 10, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
      building(2, 16, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(17, 16, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
    ],
    waters: [
      water(1, 17),
      water(2, 17),
      water(1, 18),
      water(2, 18),
      water(17, 17),
      water(18, 17),
      water(17, 18),
      water(18, 18),
      water(8, 15),
      water(10, 15),
    ],
    waves: [
      [g("basic", 10, 1.0)],
      [
        g("basic", 12, 0.8),
        g("fast", 4, 1.1),
        g("medic", 1, 1.0),
      ],
      [
        g("basic", 14, 0.7),
        g("fast", 6, 1.0),
      ],
      [
        g("basic", 16, 0.6),
        g("fast", 8, 0.9),
        g("tank", 2, 2.0),
        g("medic", 1, 1.0),
      ],
      [
        g("basic", 18, 0.5),
        g("fast", 10, 0.8),
        g("tank", 3, 1.5),
      ],
      [
        g("basic", 20, 0.45),
        g("fast", 12, 0.7),
        g("tank", 4, 1.3),
        g("medic", 2, 1.0),
      ],
      [
        g("basic", 22, 0.4),
        g("fast", 14, 0.6),
        g("tank", 5, 1.2),
      ],
      [
        g("basic", 26, 0.35),
        g("fast", 16, 0.5),
        g("tank", 8, 1.0),
        g("medic", 3, 1.0),
      ],
    ],
  },

  // Sector 3 "The Coil": the vein is a spiral, not a corridor. One channel
  // enters at top-left and winds clockwise inward — outer ring, mid ring,
  // inner ring — ending at the core in the map's center. Towers between two
  // loops reach multiple path segments at once (concentric coverage), and the
  // two pockets around the core (the 2x2 rings at (8,8) and (10,11)) are the
  // "kitchen sink": the last stop before the core, where everything converges.
  // Rocks are cooled mineral crust; the corner pools are molten vents.
  level_3: {
    name: "3",
    startingMoney: 250,
    gridSize: 20,
    paths: [
      [
        [2, 0],
        [2, 17],
        [17, 17],
        [17, 3],
        [4, 3],
        [4, 14],
        [14, 14],
        [14, 5],
        [6, 5],
        [6, 12],
        [12, 12],
        [12, 6],
        [10, 6],
        [10, 11],
      ],
    ],
    buildings: [
      building(5, 2, "box", 0.86, 0.86, 2.1, "#8b7355"),
      building(14, 2, "cylinder", 0.8, 0.8, 1.9, "#6b7280"),
      building(0, 15, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(18, 15, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
      building(16, 16, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(18, 4, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(6, 2, "box", 0.8, 0.8, 1.9, "#8b7355"),
      building(13, 10, "box", 0.86, 0.86, 2.1, "#78716c"),
      building(8, 6, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
      building(5, 10, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
      building(8, 13, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
      building(10, 13, "box", 0.86, 0.86, 2.1, "#8b7355"),
      building(11, 13, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(9, 9, "cylinder", 0.7, 0.7, 1.8, "#57534e"),
      building(13, 9, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(3, 1, "box", 0.8, 0.8, 1.9, "#78716c"),
      building(19, 2, "cylinder", 0.75, 0.75, 2.0, "#6b7280"),
      building(0, 17, "box", 0.8, 0.8, 1.9, "#78716c"),
    ],
    waters: [
      water(0, 0),
      water(1, 0),
      water(0, 1),
      water(1, 1),
      water(18, 0),
      water(19, 0),
      water(18, 1),
      water(19, 1),
      water(0, 18),
      water(1, 18),
      water(0, 19),
      water(1, 19),
      water(18, 18),
      water(19, 18),
      water(18, 19),
      water(19, 19),
    ],
    waves: [
      [g("basic", 12, 0.9)],
      [
        g("basic", 14, 0.8),
        g("fast", 5, 1.0),
        g("medic", 1, 1.0),
      ],
      [
        g("basic", 16, 0.7),
        g("fast", 7, 0.9),
      ],
      [
        g("basic", 18, 0.6),
        g("fast", 9, 0.85),
        g("tank", 2, 2.0),
        g("medic", 1, 1.0),
      ],
      [
        g("basic", 20, 0.55),
        g("fast", 11, 0.75),
        g("tank", 3, 1.6),
        g("medic", 2, 1.0),
      ],
      [
        g("basic", 22, 0.5),
        g("fast", 13, 0.65),
        g("tank", 4, 1.4),
        g("medic", 2, 0.9),
      ],
      [
        g("basic", 26, 0.45),
        g("fast", 15, 0.6),
        g("tank", 5, 1.2),
      ],
      [
        g("basic", 28, 0.4),
        g("fast", 18, 0.5),
        g("tank", 6, 1.1),
        g("medic", 3, 0.9),
      ],
      [
        g("basic", 32, 0.35),
        g("fast", 20, 0.45),
        g("tank", 8, 1.0),
        g("medic", 4, 0.9),
      ],
    ],
  },
};

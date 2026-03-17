import { create } from "zustand";

import { levelConfigSchema, type LevelConfigData } from "../levelConfig";
import type { LevelEditorSelection, LevelEditorTool, LevelEditorValidationIssue } from "../types/editor";
import type { EnemyType, PathWaypoint, WaveConfig } from "../types/game";
import type { TileData } from "../types/utils";
import { getTilePlacementState } from "../../utils/tilePlacement";
import {
  computeWaveTotalEnemies,
  createEmptyLevelConfig,
  getLevelGridOffset,
  normalizeImportedLevel,
  resizePathWaypoints,
  tileToWaypoint,
  waypointToTile,
  withRecalculatedBuildingCoordinates,
} from "../../utils/levelEditor";

type LevelEditorStoreState = {
  draftLevel: LevelConfigData;
  activeTool: LevelEditorTool;
  hoveredTile: TileData | null;
  selected: LevelEditorSelection;
  selectedPathIndex: number;
  validationIssues: LevelEditorValidationIssue[];
  hasUnsavedChanges: boolean;
};

type LevelEditorStoreActions = {
  resetDraftLevel: () => void;
  loadDraftLevel: (level: LevelConfigData, tileSize: number) => void;
  setActiveTool: (tool: LevelEditorTool) => void;
  setHoveredTile: (tile: TileData | null) => void;
  setLevelName: (name: string) => void;
  setStartingMoney: (value: number) => void;
  setGridSize: (gridSize: number, tileSize: number) => void;
  setEnemyWeight: (enemyType: EnemyType, value: number | null) => void;
  addPath: () => void;
  selectPath: (pathIndex: number) => void;
  removeSelectedPath: () => void;
  selectBuilding: (buildingId: number) => void;
  updateSelectedBuilding: (
    updates: Partial<LevelConfigData["buildings"][number]>,
    tileSize: number
  ) => void;
  removeSelectedBuilding: () => void;
  selectWaypoint: (pathIndex: number, waypointIndex: number) => void;
  updateSelectedWaypoint: (tile: TileData, tileSize: number) => void;
  removeSelectedWaypoint: () => void;
  handleTileAction: (
    tile: TileData,
    tileSize: number,
    pathWidth: number
  ) => void;
  addWave: () => void;
  removeWave: (waveIndex: number) => void;
  addWaveEnemyGroup: (waveIndex: number) => void;
  updateWaveEnemyGroup: (
    waveIndex: number,
    enemyGroupIndex: number,
    updates: Partial<WaveConfig["enemies"][number]>
  ) => void;
  removeWaveEnemyGroup: (waveIndex: number, enemyGroupIndex: number) => void;
  validateDraftLevel: () => boolean;
  clearValidationIssues: () => void;
};

type LevelEditorStore = LevelEditorStoreState & LevelEditorStoreActions;

const DEFAULT_STATE: LevelEditorStoreState = {
  draftLevel: createEmptyLevelConfig(),
  activeTool: "select",
  hoveredTile: null,
  selected: null,
  selectedPathIndex: 0,
  validationIssues: [],
  hasUnsavedChanges: false,
};

const buildIssues = (level: LevelConfigData) => {
  const result = levelConfigSchema.safeParse(level);
  const customIssues: LevelEditorValidationIssue[] = [];

  if (level.name.trim().length === 0) {
    customIssues.push({
      path: "name",
      message: "Level name is required.",
    });
  }

  if (level.pathWaypoints.length === 0) {
    customIssues.push({
      path: "pathWaypoints",
      message: "At least one path is required.",
    });
  }

  level.pathWaypoints.forEach((path, index) => {
    if (path.length < 2) {
      customIssues.push({
        path: `pathWaypoints.${index}`,
        message: "Each path needs at least 2 waypoints.",
      });
    }
  });

  if (result.success) {
    return customIssues;
  }

  return [
    ...result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
    ...customIssues,
  ];
};

const getNextBuildingId = (level: LevelConfigData) => {
  const maxId = level.buildings.reduce(
    (currentMax, building) => Math.max(currentMax, building.id),
    0
  );

  return maxId + 1;
};

const getWaypointSelectionForTile = (
  level: LevelConfigData,
  tile: TileData,
  tileSize: number
) => {
  for (let pathIndex = 0; pathIndex < level.pathWaypoints.length; pathIndex += 1) {
    const path = level.pathWaypoints[pathIndex];

    for (
      let waypointIndex = 0;
      waypointIndex < path.length;
      waypointIndex += 1
    ) {
      const waypointTile = waypointToTile(path[waypointIndex], level.gridSize, tileSize);

      if (
        waypointTile.gridX === tile.gridX &&
        waypointTile.gridZ === tile.gridZ
      ) {
        return {
          pathIndex,
          waypointIndex,
        };
      }
    }
  }

  return null;
};

const ensurePathExists = (
  pathWaypoints: PathWaypoint[][],
  pathIndex: number
): PathWaypoint[][] => {
  if (pathWaypoints[pathIndex]) {
    return pathWaypoints;
  }

  const nextPaths = [...pathWaypoints];
  nextPaths[pathIndex] = [];
  return nextPaths;
};

const createBuildingDefaults = (
  gridX: number,
  gridZ: number,
  level: LevelConfigData,
  tileSize: number
) => {
  return withRecalculatedBuildingCoordinates(
    {
      id: getNextBuildingId(level),
      gridX,
      gridZ,
      x: gridX,
      z: gridZ,
      shape: "box",
      width: 0.8,
      depth: 0.8,
      height: 1.8,
      color: "#8b7355",
    },
    level.gridSize,
    tileSize
  );
};

export const useLevelEditorStore = create<LevelEditorStore>((set, get) => ({
  ...DEFAULT_STATE,

  resetDraftLevel: () => {
    set({
      ...DEFAULT_STATE,
      draftLevel: createEmptyLevelConfig(),
    });
  },

  loadDraftLevel: (level, tileSize) => {
    const normalized = normalizeImportedLevel(level, tileSize);

    set({
      draftLevel: normalized,
      selectedPathIndex: 0,
      selected: null,
      activeTool: "select",
      hoveredTile: null,
      validationIssues: [],
      hasUnsavedChanges: false,
    });
  },

  setActiveTool: (tool) => {
    set({ activeTool: tool });
  },

  setHoveredTile: (tile) => {
    set({ hoveredTile: tile });
  },

  setLevelName: (name) => {
    set((state) => ({
      draftLevel: {
        ...state.draftLevel,
        name,
      },
      hasUnsavedChanges: true,
    }));
  },

  setStartingMoney: (value) => {
    set((state) => ({
      draftLevel: {
        ...state.draftLevel,
        startingMoney: value,
      },
      hasUnsavedChanges: true,
    }));
  },

  setGridSize: (gridSize, tileSize) => {
    set((state) => {
      const nextGridSize = Math.max(5, Math.round(gridSize));

      return {
        draftLevel: {
          ...state.draftLevel,
          gridSize: nextGridSize,
          pathWaypoints: resizePathWaypoints(
            state.draftLevel.pathWaypoints,
            state.draftLevel.gridSize,
            nextGridSize,
            tileSize
          ),
          buildings: state.draftLevel.buildings.map((building) =>
            withRecalculatedBuildingCoordinates(
              {
                ...building,
                gridX: Math.max(0, Math.min(nextGridSize - 1, building.gridX)),
                gridZ: Math.max(0, Math.min(nextGridSize - 1, building.gridZ)),
              },
              nextGridSize,
              tileSize
            )
          ),
        },
        hasUnsavedChanges: true,
      };
    });
  },

  setEnemyWeight: (enemyType, value) => {
    set((state) => {
      const nextWeights = {
        basic: state.draftLevel.enemyWeights?.basic ?? 1,
        fast: state.draftLevel.enemyWeights?.fast ?? 1,
        tank: state.draftLevel.enemyWeights?.tank ?? 1,
      };

      if (value === null) {
        nextWeights[enemyType] = 0;
      } else {
        nextWeights[enemyType] = Math.max(0, value);
      }

      const hasPositiveWeight = Object.values(nextWeights).some(
        (weight) => weight > 0
      );

      return {
        draftLevel: {
          ...state.draftLevel,
          enemyWeights: hasPositiveWeight ? nextWeights : null,
        },
        hasUnsavedChanges: true,
      };
    });
  },

  addPath: () => {
    set((state) => ({
      draftLevel: {
        ...state.draftLevel,
        pathWaypoints: [...state.draftLevel.pathWaypoints, []],
      },
      selectedPathIndex: state.draftLevel.pathWaypoints.length,
      selected: {
        type: "path",
        pathIndex: state.draftLevel.pathWaypoints.length,
      },
      hasUnsavedChanges: true,
    }));
  },

  selectPath: (pathIndex) => {
    set({
      selectedPathIndex: pathIndex,
      selected: {
        type: "path",
        pathIndex,
      },
    });
  },

  removeSelectedPath: () => {
    set((state) => {
      if (!state.draftLevel.pathWaypoints[state.selectedPathIndex]) {
        return state;
      }

      const nextPaths = state.draftLevel.pathWaypoints.filter(
        (_path, pathIndex) => pathIndex !== state.selectedPathIndex
      );

      return {
        draftLevel: {
          ...state.draftLevel,
          pathWaypoints: nextPaths.length > 0 ? nextPaths : [[]],
        },
        selectedPathIndex: Math.max(
          0,
          Math.min(state.selectedPathIndex, nextPaths.length - 1)
        ),
        selected: null,
        hasUnsavedChanges: true,
      };
    });
  },

  selectBuilding: (buildingId) => {
    set({
      selected: {
        type: "building",
        id: buildingId,
      },
    });
  },

  updateSelectedBuilding: (updates, tileSize) => {
    set((state) => {
      if (state.selected?.type !== "building") {
        return state;
      }

      const selectedBuildingId = state.selected.id;

      const nextBuildings = state.draftLevel.buildings.map((building) => {
        if (building.id !== selectedBuildingId) {
          return building;
        }

        return withRecalculatedBuildingCoordinates(
          {
            ...building,
            ...updates,
            gridX:
              updates.gridX === undefined
                ? building.gridX
                : Math.max(0, Math.min(state.draftLevel.gridSize - 1, updates.gridX)),
            gridZ:
              updates.gridZ === undefined
                ? building.gridZ
                : Math.max(0, Math.min(state.draftLevel.gridSize - 1, updates.gridZ)),
          },
          state.draftLevel.gridSize,
          tileSize
        );
      });

      return {
        draftLevel: {
          ...state.draftLevel,
          buildings: nextBuildings,
        },
        hasUnsavedChanges: true,
      };
    });
  },

  removeSelectedBuilding: () => {
    set((state) => {
      if (state.selected?.type !== "building") {
        return state;
      }

      const selectedBuildingId = state.selected.id;

      return {
        draftLevel: {
          ...state.draftLevel,
          buildings: state.draftLevel.buildings.filter(
            (building) => building.id !== selectedBuildingId
          ),
        },
        selected: null,
        hasUnsavedChanges: true,
      };
    });
  },

  selectWaypoint: (pathIndex, waypointIndex) => {
    set({
      selectedPathIndex: pathIndex,
      selected: {
        type: "waypoint",
        pathIndex,
        waypointIndex,
      },
    });
  },

  updateSelectedWaypoint: (tile, tileSize) => {
    set((state) => {
      if (state.selected?.type !== "waypoint") {
        return state;
      }

      const { pathIndex: selectedPathIndex, waypointIndex: selectedWaypointIndex } =
        state.selected;

      const nextWaypoint = tileToWaypoint(
        tile,
        state.draftLevel.gridSize,
        tileSize
      );

      const nextPaths = state.draftLevel.pathWaypoints.map((path, pathIndex) => {
        if (pathIndex !== selectedPathIndex) {
          return path;
        }

        return path.map((waypoint, waypointIndex) =>
          waypointIndex === selectedWaypointIndex ? nextWaypoint : waypoint
        );
      });

      return {
        draftLevel: {
          ...state.draftLevel,
          pathWaypoints: nextPaths,
        },
        hasUnsavedChanges: true,
      };
    });
  },

  removeSelectedWaypoint: () => {
    set((state) => {
      if (state.selected?.type !== "waypoint") {
        return state;
      }

      const { pathIndex: selectedPathIndex, waypointIndex: selectedWaypointIndex } =
        state.selected;

      const nextPaths = state.draftLevel.pathWaypoints.map((path, pathIndex) => {
        if (pathIndex !== selectedPathIndex) {
          return path;
        }

        return path.filter(
          (_waypoint, waypointIndex) => waypointIndex !== selectedWaypointIndex
        );
      });

      return {
        draftLevel: {
          ...state.draftLevel,
          pathWaypoints: nextPaths,
        },
        selected: null,
        hasUnsavedChanges: true,
      };
    });
  },

  handleTileAction: (tile, tileSize, pathWidth) => {
    set((state) => {
      const { activeTool, draftLevel, selectedPathIndex } = state;
      const building = draftLevel.buildings.find(
        (item) => item.gridX === tile.gridX && item.gridZ === tile.gridZ
      );
      const waypointSelection = getWaypointSelectionForTile(
        draftLevel,
        tile,
        tileSize
      );

      if (activeTool === "select") {
        if (building) {
          return {
            selected: {
              type: "building",
              id: building.id,
            },
          };
        }

        if (waypointSelection) {
          return {
            selectedPathIndex: waypointSelection.pathIndex,
            selected: {
              type: "waypoint",
              pathIndex: waypointSelection.pathIndex,
              waypointIndex: waypointSelection.waypointIndex,
            },
          };
        }

        return {
          selected: null,
        };
      }

      if (activeTool === "erase") {
        if (building) {
          return {
            draftLevel: {
              ...draftLevel,
              buildings: draftLevel.buildings.filter(
                (item) => item.id !== building.id
              ),
            },
            selected: null,
            hasUnsavedChanges: true,
          };
        }

        if (waypointSelection) {
          return {
            draftLevel: {
              ...draftLevel,
              pathWaypoints: draftLevel.pathWaypoints.map((path, pathIndex) => {
                if (pathIndex !== waypointSelection.pathIndex) {
                  return path;
                }

                return path.filter(
                  (_waypoint, waypointIndex) =>
                    waypointIndex !== waypointSelection.waypointIndex
                );
              }),
            },
            selected: null,
            hasUnsavedChanges: true,
          };
        }

        return state;
      }

      if (activeTool === "placeBuilding") {
        const placementState = getTilePlacementState({
          gridX: tile.gridX,
          gridZ: tile.gridZ,
          towers: [],
          buildings: draftLevel.buildings,
          gridOffset: getLevelGridOffset(draftLevel.gridSize, tileSize),
          tileSize,
          pathWaypoints: draftLevel.pathWaypoints,
          pathWidth,
        });

        if (placementState.isBlocked) {
          return state;
        }

        const nextBuilding = createBuildingDefaults(
          tile.gridX,
          tile.gridZ,
          draftLevel,
          tileSize
        );

        return {
          draftLevel: {
            ...draftLevel,
            buildings: [...draftLevel.buildings, nextBuilding],
          },
          selected: {
            type: "building",
            id: nextBuilding.id,
          },
          hasUnsavedChanges: true,
        };
      }

      const nextWaypoint = tileToWaypoint(tile, draftLevel.gridSize, tileSize);
      const ensuredPaths = ensurePathExists(
        draftLevel.pathWaypoints,
        selectedPathIndex
      );
      const currentPath = ensuredPaths[selectedPathIndex] ?? [];

      if (activeTool === "drawPath") {
        const previousWaypoint = currentPath[currentPath.length - 1];
        if (
          previousWaypoint &&
          previousWaypoint.x === nextWaypoint.x &&
          previousWaypoint.z === nextWaypoint.z
        ) {
          return state;
        }

        const nextPaths = ensuredPaths.map((path, pathIndex) =>
          pathIndex === selectedPathIndex ? [...path, nextWaypoint] : path
        );

        return {
          draftLevel: {
            ...draftLevel,
            pathWaypoints: nextPaths,
          },
          selected: {
            type: "waypoint",
            pathIndex: selectedPathIndex,
            waypointIndex: nextPaths[selectedPathIndex].length - 1,
          },
          hasUnsavedChanges: true,
        };
      }

      if (activeTool === "setSpawn") {
        const nextPath =
          currentPath.length === 0 ? [nextWaypoint] : [nextWaypoint, ...currentPath.slice(1)];

        const nextPaths = ensuredPaths.map((path, pathIndex) =>
          pathIndex === selectedPathIndex ? nextPath : path
        );

        return {
          draftLevel: {
            ...draftLevel,
            pathWaypoints: nextPaths,
          },
          selected: {
            type: "waypoint",
            pathIndex: selectedPathIndex,
            waypointIndex: 0,
          },
          hasUnsavedChanges: true,
        };
      }

      if (activeTool === "setBase") {
        const nextPath =
          currentPath.length === 0
            ? [nextWaypoint]
            : currentPath.length === 1
              ? [currentPath[0], nextWaypoint]
              : [...currentPath.slice(0, -1), nextWaypoint];

        const nextPaths = ensuredPaths.map((path, pathIndex) =>
          pathIndex === selectedPathIndex ? nextPath : path
        );

        return {
          draftLevel: {
            ...draftLevel,
            pathWaypoints: nextPaths,
          },
          selected: {
            type: "waypoint",
            pathIndex: selectedPathIndex,
            waypointIndex: nextPath.length - 1,
          },
          hasUnsavedChanges: true,
        };
      }

      return state;
    });
  },

  addWave: () => {
    set((state) => ({
      draftLevel: {
        ...state.draftLevel,
        waveConfigs: [
          ...state.draftLevel.waveConfigs,
          {
            totalEnemies: 0,
            enemies: [],
          },
        ],
      },
      hasUnsavedChanges: true,
    }));
  },

  removeWave: (waveIndex) => {
    set((state) => ({
      draftLevel: {
        ...state.draftLevel,
        waveConfigs: state.draftLevel.waveConfigs.filter(
          (_wave, index) => index !== waveIndex
        ),
      },
      hasUnsavedChanges: true,
    }));
  },

  addWaveEnemyGroup: (waveIndex) => {
    set((state) => {
      const nextWaveConfigs = state.draftLevel.waveConfigs.map((wave, index) => {
        if (index !== waveIndex) {
          return wave;
        }

        const nextWave = {
          ...wave,
          enemies: [
            ...wave.enemies,
            {
              type: "basic" as EnemyType,
              count: 1,
              spawnInterval: 1,
            },
          ],
        };

        return {
          ...nextWave,
          totalEnemies: computeWaveTotalEnemies(nextWave),
        };
      });

      return {
        draftLevel: {
          ...state.draftLevel,
          waveConfigs: nextWaveConfigs,
        },
        hasUnsavedChanges: true,
      };
    });
  },

  updateWaveEnemyGroup: (waveIndex, enemyGroupIndex, updates) => {
    set((state) => {
      const nextWaveConfigs = state.draftLevel.waveConfigs.map((wave, index) => {
        if (index !== waveIndex) {
          return wave;
        }

        const nextWave = {
          ...wave,
          enemies: wave.enemies.map((enemyGroup, indexInWave) =>
            indexInWave === enemyGroupIndex
              ? {
                  ...enemyGroup,
                  ...updates,
                  count:
                    updates.count === undefined
                      ? enemyGroup.count
                      : Math.max(0, updates.count),
                  spawnInterval:
                    updates.spawnInterval === undefined
                      ? enemyGroup.spawnInterval
                      : Math.max(0.1, updates.spawnInterval),
                }
              : enemyGroup
          ),
        };

        return {
          ...nextWave,
          totalEnemies: computeWaveTotalEnemies(nextWave),
        };
      });

      return {
        draftLevel: {
          ...state.draftLevel,
          waveConfigs: nextWaveConfigs,
        },
        hasUnsavedChanges: true,
      };
    });
  },

  removeWaveEnemyGroup: (waveIndex, enemyGroupIndex) => {
    set((state) => {
      const nextWaveConfigs = state.draftLevel.waveConfigs.map((wave, index) => {
        if (index !== waveIndex) {
          return wave;
        }

        const nextWave = {
          ...wave,
          enemies: wave.enemies.filter(
            (_enemyGroup, indexInWave) => indexInWave !== enemyGroupIndex
          ),
        };

        return {
          ...nextWave,
          totalEnemies: computeWaveTotalEnemies(nextWave),
        };
      });

      return {
        draftLevel: {
          ...state.draftLevel,
          waveConfigs: nextWaveConfigs,
        },
        hasUnsavedChanges: true,
      };
    });
  },

  validateDraftLevel: () => {
    const validationIssues = buildIssues(get().draftLevel);
    set({ validationIssues });
    return validationIssues.length === 0;
  },

  clearValidationIssues: () => {
    set({ validationIssues: [] });
  },
}));

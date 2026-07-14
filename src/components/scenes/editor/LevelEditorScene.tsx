import { useCallback, useMemo } from "react";

import type { ThreeEvent } from "@react-three/fiber";

import { EndBuilding } from "../../entities/EndBuilding";
import { PlanetTileDecorations } from "../../entities/PlanetTileDecorations";
import { Portal } from "../../entities/Portal";
import { Water } from "../../entities/Water";
import { Light } from "../shared/Light";
import { Skybox } from "../shared/Skybox";
import {
  tileSizeSelector,
  pathWidthSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import {
  getPathRenderSegments,
  getPathSegmentYaw,
} from "../../../utils/pathUtils";
import { getTilePlacementState } from "../../../utils/tilePlacement";
import {
  getLevelGridOffset,
  withRecalculatedWaterCoordinates,
} from "../../../utils/levelEditor";
import { getCssColorValue } from "../../ui/lib/cssUtils";
import { LevelEditorCamera } from "./LevelEditorCamera";
import { LevelEditorTerrainTile } from "./LevelEditorTerrainTile";

const BUILDING_OUTLINE_SCALE = 1.06;

const getWaypointColor = (
  isSelected: boolean,
  isEdgeWaypoint: boolean,
  isInSelectedPath: boolean
) => {
  if (isSelected) return getCssColorValue("editor-indicator-selected");
  if (isEdgeWaypoint) return getCssColorValue("editor-indicator-edge");
  if (isInSelectedPath) return getCssColorValue("editor-indicator-path");
  return getCssColorValue("editor-indicator-idle");
};

export const LevelEditorScene = () => {
  const tileSize = useGameStore(tileSizeSelector);
  const pathWidth = useGameStore(pathWidthSelector);
  const {
    draftLevel,
    activeTool,
    hoveredTile,
    selected,
    selectedPathIndex,
    handleTileAction,
    setHoveredTile,
    selectBuilding,
    selectWaypoint,
  } = useLevelEditorStore();

  const gridOffset = useMemo(
    () => getLevelGridOffset(draftLevel.gridSize, tileSize),
    [draftLevel.gridSize, tileSize]
  );

  const tiles = useMemo(() => {
    const tileEntries: Array<{ gridX: number; gridZ: number }> = [];

    for (let gridX = 0; gridX < draftLevel.gridSize; gridX += 1) {
      for (let gridZ = 0; gridZ < draftLevel.gridSize; gridZ += 1) {
        tileEntries.push({ gridX, gridZ });
      }
    }

    return tileEntries;
  }, [draftLevel.gridSize]);

  const onTileHover = useCallback(
    (gridX: number, gridZ: number) => {
      setHoveredTile({ gridX, gridZ });
    },
    [setHoveredTile]
  );

  const onTileHoverEnd = useCallback(() => {
    setHoveredTile(null);
  }, [setHoveredTile]);

  const onTileClick = useCallback(
    (gridX: number, gridZ: number) => {
      handleTileAction({ gridX, gridZ }, tileSize, pathWidth);
    },
    [handleTileAction, pathWidth, tileSize]
  );

  return (
    <>
      <Skybox />
      <Light />
      <LevelEditorCamera gridSize={draftLevel.gridSize} tileSize={tileSize} />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.1, 0]}
        receiveShadow
      >
        <planeGeometry
          args={[
            draftLevel.gridSize * tileSize,
            draftLevel.gridSize * tileSize,
          ]}
        />
        <meshStandardMaterial
          color={
            draftLevel.groundColor ?? getCssColorValue("editor-default-ground")
          }
        />
      </mesh>

      <group>
        {tiles.map(({ gridX, gridZ }) => {
          const placementState = getTilePlacementState({
            gridX,
            gridZ,
            towers: [],
            buildings: draftLevel.buildings,
            waters: draftLevel.waters,
            gridOffset,
            tileSize,
            pathWaypoints: draftLevel.pathWaypoints,
            pathWidth,
          });
          const isHovered =
            hoveredTile?.gridX === gridX && hoveredTile?.gridZ === gridZ;
          const canPlaceBuilding =
            activeTool === "placeBuilding" && !placementState.isBlocked;
          const canPaintWater =
            activeTool === "water" && !placementState.isOnPath;
          const canHighlightEditorAction =
            canPlaceBuilding || (activeTool === "water" && canPaintWater);
          const baseTileColor =
            draftLevel.tileColor ?? getCssColorValue("editor-default-tile");

          return (
            <LevelEditorTerrainTile
              key={`${gridX}-${gridZ}`}
              gridX={gridX}
              gridZ={gridZ}
              gridSize={draftLevel.gridSize}
              tileSize={tileSize}
              landBaseColor={baseTileColor}
              placementState={placementState}
              isHovered={isHovered}
              canHighlightEditorAction={canHighlightEditorAction}
              activeTool={activeTool}
              onTileClick={() => onTileClick(gridX, gridZ)}
              onTileHover={() => onTileHover(gridX, gridZ)}
              onTileHoverEnd={onTileHoverEnd}
            />
          );
        })}
      </group>

      <PlanetTileDecorations
        //gridSize={draftLevel.gridSize}
        //tileSize={tileSize}
        //gridOffset={gridOffset}
        pathWaypoints={draftLevel.pathWaypoints}
        //pathWidth={pathWidth}
        //waters={draftLevel.waters}
        //buildings={draftLevel.buildings}
        towers={[]}
        //surfaceHalfHeight={LEVEL_EDITOR_TILE_HEIGHT / 2}
      />

      <group>
        {draftLevel.pathWaypoints.map((path, pathIndex) => {
          const isSelectedPath =
            selectedPathIndex === pathIndex ||
            (selected?.type === "path" && selected.pathIndex === pathIndex) ||
            (selected?.type === "waypoint" && selected.pathIndex === pathIndex);
          const segments = getPathRenderSegments(path);

          return (
            <group key={`editor-path-${pathIndex}`}>
              {segments.map((segment) => {
                const segmentKey = [
                  segment.start.x,
                  segment.start.z,
                  segment.end.x,
                  segment.end.z,
                ].join(":");

                return (
                  <group key={`editor-path-${pathIndex}-segment-${segmentKey}`}>
                    <mesh
                      position={[segment.centerX, 0.03, segment.centerZ]}
                      rotation={[0, segment.yaw, 0]}
                    >
                      <boxGeometry args={[segment.length, 0.025, pathWidth]} />
                      <meshStandardMaterial
                        color={
                          isSelectedPath
                            ? getCssColorValue("editor-path-active")
                            : getCssColorValue("scene-gray-500")
                        }
                      />
                    </mesh>
                    <mesh
                      position={[segment.centerX, 0.02, segment.centerZ]}
                      rotation={[0, segment.yaw, 0]}
                    >
                      <boxGeometry
                        args={[segment.length, 0.01, pathWidth + 0.06]}
                      />
                      <meshStandardMaterial
                        color={
                          isSelectedPath
                            ? getCssColorValue("editor-path-active-border")
                            : getCssColorValue("scene-gray-600")
                        }
                      />
                    </mesh>
                  </group>
                );
              })}

              {path.map((waypoint, waypointIndex) => {
                const isSelectedWaypoint =
                  selected?.type === "waypoint" &&
                  selected.pathIndex === pathIndex &&
                  selected.waypointIndex === waypointIndex;
                const isEdgeWaypoint =
                  waypointIndex === 0 || waypointIndex === path.length - 1;
                const color = getWaypointColor(
                  isSelectedWaypoint,
                  isEdgeWaypoint,
                  isSelectedPath
                );

                return (
                  <mesh
                    key={`editor-path-${pathIndex}-waypoint-${waypointIndex}`}
                    position={[waypoint.x, 0.18, waypoint.z]}
                    onClick={(event: ThreeEvent<MouseEvent>) => {
                      event.stopPropagation();
                      selectWaypoint(pathIndex, waypointIndex);
                    }}
                  >
                    <sphereGeometry
                      args={[isSelectedWaypoint ? 0.2 : 0.14, 16, 16]}
                    />
                    <meshStandardMaterial
                      color={color}
                      emissive={color}
                      emissiveIntensity={isSelectedWaypoint ? 0.45 : 0.2}
                    />
                  </mesh>
                );
              })}

              {path[0] ? (
                <Portal
                  position={[path[0].x, path[0].y + 0.2, path[0].z]}
                  pathYaw={
                    path.length >= 2
                      ? getPathSegmentYaw(
                          path[1].x - path[0].x,
                          path[1].z - path[0].z
                        )
                      : 0
                  }
                />
              ) : null}

              {path.length > 1 ? (
                <EndBuilding
                  position={[
                    path[path.length - 1].x,
                    path[path.length - 1].y,
                    path[path.length - 1].z,
                  ]}
                />
              ) : null}
            </group>
          );
        })}
      </group>

      <group>
        {draftLevel.waters.map((water) => (
          <Water
            key={water.id}
            water={withRecalculatedWaterCoordinates(
              water,
              draftLevel.gridSize,
              tileSize
            )}
          />
        ))}
      </group>

      <group>
        {draftLevel.buildings.map((building) => {
          const isSelectedBuilding =
            selected?.type === "building" && selected.id === building.id;
          const yPosition = building.height / 2;

          return (
            <group
              key={building.id}
              position={[building.x, 0, building.z]}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation();
                selectBuilding(building.id);
              }}
            >
              {building.shape === "box" ? (
                <>
                  <mesh position={[0, yPosition, 0]}>
                    <boxGeometry
                      args={[building.width, building.height, building.depth]}
                    />
                    <meshStandardMaterial color={building.color} />
                  </mesh>
                  {isSelectedBuilding ? (
                    <mesh position={[0, yPosition, 0]}>
                      <boxGeometry
                        args={[
                          building.width * BUILDING_OUTLINE_SCALE,
                          building.height * BUILDING_OUTLINE_SCALE,
                          building.depth * BUILDING_OUTLINE_SCALE,
                        ]}
                      />
                      <meshStandardMaterial
                        color={getCssColorValue("editor-indicator-selected")}
                        wireframe
                        transparent
                        opacity={0.8}
                      />
                    </mesh>
                  ) : null}
                </>
              ) : (
                <>
                  <mesh position={[0, yPosition, 0]}>
                    <cylinderGeometry
                      args={[
                        building.width / 2,
                        building.width / 2,
                        building.height,
                        16,
                      ]}
                    />
                    <meshStandardMaterial color={building.color} />
                  </mesh>
                  {isSelectedBuilding ? (
                    <mesh position={[0, yPosition, 0]}>
                      <cylinderGeometry
                        args={[
                          (building.width / 2) * BUILDING_OUTLINE_SCALE,
                          (building.width / 2) * BUILDING_OUTLINE_SCALE,
                          building.height * BUILDING_OUTLINE_SCALE,
                          16,
                        ]}
                      />
                      <meshStandardMaterial
                        color={getCssColorValue("editor-indicator-selected")}
                        wireframe
                        transparent
                        opacity={0.8}
                      />
                    </mesh>
                  ) : null}
                </>
              )}
            </group>
          );
        })}
      </group>
    </>
  );
};

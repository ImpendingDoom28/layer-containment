import { useCallback, useMemo } from "react";

import type { ThreeEvent } from "@react-three/fiber";

import { EndBuilding } from "../../entities/EndBuilding";
import { Portal } from "../../entities/Portal";
import { Light } from "../shared/Light";
import { Skybox } from "../shared/Skybox";
import {
  tileSizeSelector,
  pathWidthSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import { getPathRenderSegments } from "../../../utils/pathUtils";
import { getTilePlacementState } from "../../../utils/tilePlacement";
import { getLevelGridOffset } from "../../../utils/levelEditor";
import { LevelEditorCamera } from "./LevelEditorCamera";

const TILE_HEIGHT = 0.02;
const BUILDING_OUTLINE_SCALE = 1.06;

const toolPreviewColors = {
  select: "#374151",
  placeBuilding: "#1d4ed8",
  drawPath: "#7c3aed",
  setSpawn: "#15803d",
  setBase: "#b45309",
  erase: "#b91c1c",
} as const;

const getWaypointColor = (
  isSelected: boolean,
  isEdgeWaypoint: boolean,
  isInSelectedPath: boolean
) => {
  if (isSelected) {
    return "#facc15";
  }

  if (isEdgeWaypoint) {
    return "#22c55e";
  }

  if (isInSelectedPath) {
    return "#a855f7";
  }

  return "#d1d5db";
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
        <meshStandardMaterial color="#3f3f46" />
      </mesh>

      <group>
        {tiles.map(({ gridX, gridZ }) => {
          const placementState = getTilePlacementState({
            gridX,
            gridZ,
            towers: [],
            buildings: draftLevel.buildings,
            gridOffset,
            tileSize,
            pathWaypoints: draftLevel.pathWaypoints,
            pathWidth,
          });
          const isHovered =
            hoveredTile?.gridX === gridX && hoveredTile?.gridZ === gridZ;
          const canPlaceBuilding =
            activeTool === "placeBuilding" && !placementState.isBlocked;
          const color = isHovered
            ? canPlaceBuilding
              ? "#3b82f6"
              : toolPreviewColors[activeTool]
            : placementState.isOnPath
              ? "#1f2937"
              : "#111827";
          const emissive = isHovered ? color : "#000000";

          return (
            <mesh
              key={`${gridX}-${gridZ}`}
              position={[
                gridOffset + gridX + tileSize / 2,
                0,
                gridOffset + gridZ + tileSize / 2,
              ]}
              onClick={() => onTileClick(gridX, gridZ)}
              onPointerOver={(event) => {
                event.stopPropagation();
                onTileHover(gridX, gridZ);
              }}
              onPointerOut={(event) => {
                event.stopPropagation();
                onTileHoverEnd();
              }}
            >
              <boxGeometry args={[tileSize, TILE_HEIGHT, tileSize]} />
              <meshStandardMaterial
                transparent
                opacity={isHovered ? 0.75 : 0.45}
                color={color}
                emissive={emissive}
                emissiveIntensity={isHovered ? 0.25 : 0}
              />
            </mesh>
          );
        })}
      </group>

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
                  <group
                    key={`editor-path-${pathIndex}-segment-${segmentKey}`}
                  >
                    <mesh
                      position={[segment.centerX, 0.03, segment.centerZ]}
                      rotation={[0, segment.yaw, 0]}
                    >
                      <boxGeometry args={[segment.length, 0.025, pathWidth]} />
                      <meshStandardMaterial
                        color={isSelectedPath ? "#a855f7" : "#6b7280"}
                      />
                    </mesh>
                    <mesh
                      position={[segment.centerX, 0.02, segment.centerZ]}
                      rotation={[0, segment.yaw, 0]}
                    >
                      <boxGeometry args={[segment.length, 0.01, pathWidth + 0.06]} />
                      <meshStandardMaterial
                        color={isSelectedPath ? "#7e22ce" : "#4b5563"}
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
                <Portal position={[path[0].x, path[0].y + 0.2, path[0].z]} />
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
                        color="#facc15"
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
                        color="#facc15"
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

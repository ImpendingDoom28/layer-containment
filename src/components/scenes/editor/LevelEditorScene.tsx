import { useCallback, useMemo } from "react";

import type { ThreeEvent } from "@react-three/fiber";

import { Bridge } from "../../entities/Bridge";
import { CanyonBasin } from "../../entities/CanyonBasin";
import { Path } from "../../entities/Path";
import { PlanetTileDecorations } from "../../entities/PlanetTileDecorations";
import { Water } from "../../entities/Water";
import {
  BRIDGE_ELEVATION,
  getCanyonWorldBBox,
  getBridgeTiles,
} from "../../../utils/canyonBridges";
import { Light } from "../shared/Light";
import { Skybox } from "../shared/Skybox";
import { Ground } from "../shared/Ground";
import {
  pathYOffsetSelector,
  tileSizeSelector,
  pathWidthSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import { getTilePlacementState } from "../../../utils/tilePlacement";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
  getSurfaceQuaternion,
} from "../../../utils/planetSurfaceMapping";
import {
  getLevelGridOffset,
  tileToWorldCoordinate,
  withRecalculatedWaterCoordinates,
} from "../../../utils/levelEditor";
import { useTileOccupancyMasks } from "../../../core/hooks/utils/useTileOccupancyMasks";
import { getCssColorValue } from "../../ui/lib/cssUtils";
import { LevelEditorCamera } from "./LevelEditorCamera";
import { EditorSphereTile } from "./EditorSphereTile";

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
  const pathYOffset = useGameStore(pathYOffsetSelector);
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

  const occupancy = useTileOccupancyMasks({
    gridSize: draftLevel.gridSize,
    gridOffset,
    tileSize,
    pathWaypoints: draftLevel.pathWaypoints,
    pathWidth,
    waters: draftLevel.waters,
    canyons: draftLevel.canyons,
  });

  // Bridge tiles per path, memoized so hover-only re-renders (the editor's
  // `hoveredTile` changes per tile) reuse the same arrays and the `Bridge`
  // memo holds instead of re-merging its geometry.
  const bridgeTilesByPath = useMemo(
    () =>
      draftLevel.canyons.length === 0
        ? []
        : draftLevel.pathWaypoints.map((path) =>
            getBridgeTiles(
              path,
              draftLevel.canyons,
              draftLevel.gridSize,
              tileSize
            )
          ),
    [draftLevel.pathWaypoints, draftLevel.canyons, draftLevel.gridSize, tileSize]
  );

  // The canyon's world bbox drives the basin (carved bowl + the cut in the
  // ground sphere), the canyon tiles' floor position, and the bridge struts.
  const canyonBBox = useMemo(
    () =>
      draftLevel.canyons.length === 0
        ? null
        : getCanyonWorldBBox(
            draftLevel.canyons,
            draftLevel.gridSize,
            tileSize
          ),
    [draftLevel.canyons, draftLevel.gridSize, tileSize]
  );

  const radius = useMemo(
    () => getPlanetRadius(draftLevel.gridSize, tileSize),
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

      {/* The board sits on the planet sphere, just like the game, so the canyon
          shows its real depth: the ground sphere is cut at the basin and the
          carved bowl (walls + floor) fills the hole. The tiles, path, bridge,
          water and buildings are all placed on the sphere surface. */}
      <Ground gridSize={draftLevel.gridSize} canyons={draftLevel.canyons} />
      <CanyonBasin canyons={draftLevel.canyons} gridSize={draftLevel.gridSize} />

      <group>
        {tiles.map(({ gridX, gridZ }) => {
          const placementState = getTilePlacementState({
            gridX,
            gridZ,
            towers: [],
            buildings: draftLevel.buildings,
            waters: draftLevel.waters,
            canyons: draftLevel.canyons,
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
          const canPaintCanyon =
            activeTool === "canyon" &&
            !placementState.isOnPath &&
            !placementState.isOccupiedByBuilding &&
            !placementState.isCanyon;
          const canHighlightEditorAction =
            canPlaceBuilding ||
            (activeTool === "water" && canPaintWater) ||
            canPaintCanyon;
          const baseTileColor =
            draftLevel.tileColor ?? getCssColorValue("editor-default-tile");

          return (
            <EditorSphereTile
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
              canyonBBox={canyonBBox}
              onTileClick={() => onTileClick(gridX, gridZ)}
              onTileHover={() => onTileHover(gridX, gridZ)}
              onTileHoverEnd={onTileHoverEnd}
            />
          );
        })}
      </group>

      <PlanetTileDecorations
        occupancy={occupancy}
        gridSize={draftLevel.gridSize}
      />

      {/* The path strip, baked on the sphere exactly as the game renders it
          (same component), so what the editor draws is what the game runs.
          The editor draws its own selectable waypoint markers on top; the
          spawn portal and end building come from the game, so the editor
          suppresses them here. */}
      {draftLevel.pathWaypoints.map((_, pathIndex) => (
        <Path
          key={`editor-path-strip-${pathIndex}`}
          pathIndex={pathIndex}
          pathWaypoints={draftLevel.pathWaypoints}
          gridSize={draftLevel.gridSize}
          showEndpoints={false}
        />
      ))}

      {/* Selectable waypoint markers, placed on the sphere surface. */}
      <group>
        {draftLevel.pathWaypoints.map((path, pathIndex) => {
          const isSelectedPath =
            selectedPathIndex === pathIndex ||
            (selected?.type === "path" && selected.pathIndex === pathIndex) ||
            (selected?.type === "waypoint" && selected.pathIndex === pathIndex);

          return (
            <group key={`editor-path-${pathIndex}`}>
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
                const { surfacePoint, normal } = flatFieldToSphereSurface(
                  waypoint.x,
                  waypoint.z,
                  radius
                );
                const position = surfacePoint.clone().addScaledVector(
                  normal,
                  0.18
                );

                return (
                  <mesh
                    key={`editor-path-${pathIndex}-waypoint-${waypointIndex}`}
                    position={position}
                    quaternion={getSurfaceQuaternion(normal)}
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
            </group>
          );
        })}
      </group>

      <group>
        {bridgeTilesByPath.map((bridgeTiles, pathIndex) =>
          bridgeTiles.length === 0 ? null : (
            <Bridge
              key={`editor-bridge-${pathIndex}`}
              tiles={bridgeTiles}
              deckHeight={BRIDGE_ELEVATION}
              pathYOffset={pathYOffset}
              pathWidth={pathWidth}
              tileSize={tileSize}
              gridSize={draftLevel.gridSize}
              canyonBBox={canyonBBox}
              renderDeck
            />
          )
        )}
      </group>

      <group>
        {draftLevel.waters.map((water) => {
          const worldX = tileToWorldCoordinate(
            water.gridX,
            draftLevel.gridSize,
            tileSize
          );
          const worldZ = tileToWorldCoordinate(
            water.gridZ,
            draftLevel.gridSize,
            tileSize
          );
          const surface = flatFieldToSphereSurface(worldX, worldZ, radius);
          const position = surface.surfacePoint
            .clone()
            .addScaledVector(surface.normal, 0.02);
          return (
            <Water
              key={water.id}
              water={withRecalculatedWaterCoordinates(
                water,
                draftLevel.gridSize,
                tileSize
              )}
              position={position.toArray() as [number, number, number]}
              quaternion={getSurfaceQuaternion(surface.normal)}
            />
          );
        })}
      </group>

      <group>
        {draftLevel.buildings.map((building) => {
          const isSelectedBuilding =
            selected?.type === "building" && selected.id === building.id;
          const yPosition = building.height / 2;
          const surface = flatFieldToSphereSurface(
            building.x,
            building.z,
            radius
          );
          const position = surface.surfacePoint
            .clone()
            .addScaledVector(surface.normal, 0.02);

          return (
            <group
              key={building.id}
              position={position}
              quaternion={getSurfaceQuaternion(surface.normal)}
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

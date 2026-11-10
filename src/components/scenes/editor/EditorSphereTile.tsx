import { FC, memo, useCallback, useEffect, useMemo } from "react";

import type { ThreeEvent } from "@react-three/fiber";
import { MeshStandardMaterial } from "three";

import { getCssColorValue, type ColorToken } from "../../ui/lib/cssUtils";
import type { LevelEditorTool } from "../../../core/types/editor";
import type { TilePlacementState } from "../../../utils/tilePlacement";
import type { CanyonWorldBBox } from "../../../utils/canyonBridges";
import { sampleBasinFloorY } from "../../../utils/canyonBridges";
import { tileToWorldCoordinate } from "../../../utils/levelEditor";
import {
  flatFieldToSphereSurface,
  flatFieldToSphereTilePose,
  getPlanetRadius,
} from "../../../utils/planetSurfaceMapping";
import { createPlanetTileMaterial } from "../../../utils/planetTileMaterial";
import { hashGrid2D } from "../../../core/tileGridHash";

/** The editor tile slab height. The editor has no `pathYOffset` (it is a
    design surface), so tiles use a thin fixed slab; canyon tiles are pushed
    down to the basin floor instead. */
export const LEVEL_EDITOR_TILE_HEIGHT = 0.02;

const toolTokenMap: Record<LevelEditorTool, ColorToken> = {
  select: "editor-tool-select",
  placeBuilding: "editor-tool-place-building",
  drawPath: "editor-tool-draw-path",
  setSpawn: "editor-tool-set-spawn",
  setBase: "editor-tool-set-base",
  erase: "editor-tool-erase",
  water: "editor-tool-water",
  canyon: "editor-tool-canyon",
};

const getToolPreviewColor = (tool: LevelEditorTool): string =>
  getCssColorValue(toolTokenMap[tool]);

type EditorSphereTileProps = {
  gridX: number;
  gridZ: number;
  gridSize: number;
  tileSize: number;
  landBaseColor: string;
  placementState: TilePlacementState;
  isHovered: boolean;
  canHighlightEditorAction: boolean;
  activeTool: LevelEditorTool;
  /** The canyon's world bbox; null when the level has no canyons. A canyon
      tile's slab sits at the basin floor instead of the surface. */
  canyonBBox: CanyonWorldBBox | null;
  onTileClick: () => void;
  onTileHover: () => void;
  onTileHoverEnd: () => void;
};

export const EditorSphereTile: FC<EditorSphereTileProps> = memo(
  ({
    gridX,
    gridZ,
    gridSize,
    tileSize,
    landBaseColor,
    placementState,
    isHovered,
    canHighlightEditorAction,
    activeTool,
    canyonBBox,
    onTileClick,
    onTileHover,
    onTileHoverEnd,
  }) => {
    const radius = useMemo(
      () => getPlanetRadius(gridSize, tileSize),
      [gridSize, tileSize]
    );
    const worldX = tileToWorldCoordinate(gridX, gridSize, tileSize);
    const worldZ = tileToWorldCoordinate(gridZ, gridSize, tileSize);

    // The group always sits on the surface (so a surface-level click over the
    // canyon still hits the tile's invisible hitbox). The visible slab then
    // drops to the basin floor for canyon tiles — the bowl bed the carved
    // basin reveals — or sits on the surface for land tiles.
    const surfacePose = useMemo(
      () =>
        flatFieldToSphereTilePose(
          worldX,
          worldZ,
          radius,
          LEVEL_EDITOR_TILE_HEIGHT / 2
        ),
      [worldX, worldZ, radius]
    );

    const slabLocalY = useMemo(() => {
      if (!placementState.isCanyon || !canyonBBox) return 0;
      const surface = flatFieldToSphereSurface(worldX, worldZ, radius);
      const floorY = sampleBasinFloorY(worldX, worldZ, canyonBBox, radius);
      const depth = Math.max(surface.surfacePoint.y - floorY, 0);
      return -(depth + LEVEL_EDITOR_TILE_HEIGHT / 2);
    }, [worldX, worldZ, radius, placementState.isCanyon, canyonBBox]);

    const material = useMemo(() => {
      if (
        !placementState.isOnPath &&
        !placementState.isWater &&
        !placementState.isCanyon &&
        !isHovered
      ) {
        return createPlanetTileMaterial({
          baseColor: landBaseColor,
          emissive: getCssColorValue("scene-black"),
          emissiveIntensity: 0,
          metalness: 0.05,
          roughness: 0.88,
          tileSeed: hashGrid2D(gridX, gridZ),
          tileHalfHeight: LEVEL_EDITOR_TILE_HEIGHT / 2,
          regolithHighlight: getCssColorValue("scene-regolith-highlight"),
          regolithShadow: getCssColorValue("scene-regolith-shadow"),
          transparent: true,
          opacity: 0.45,
        });
      }

      let color: string;
      if (isHovered) {
        color = canHighlightEditorAction
          ? getCssColorValue("editor-can-place")
          : getToolPreviewColor(activeTool);
      } else if (placementState.isOnPath) {
        color = getCssColorValue("scene-gray-800");
      } else if (placementState.isWater) {
        color = getCssColorValue("scene-water");
      } else if (placementState.isCanyon) {
        color = getCssColorValue("scene-canyon-rock");
      } else {
        color = landBaseColor;
      }
      const emissive = isHovered ? color : getCssColorValue("scene-black");

      return new MeshStandardMaterial({
        transparent: true,
        opacity: isHovered ? 0.75 : 0.45,
        color,
        emissive,
        emissiveIntensity: isHovered ? 0.25 : 0,
      });
    }, [
      activeTool,
      canHighlightEditorAction,
      gridX,
      gridZ,
      isHovered,
      landBaseColor,
      placementState.isOnPath,
      placementState.isWater,
      placementState.isCanyon,
    ]);

    useEffect(
      () => () => {
        material.dispose();
      },
      [material]
    );

    const onPointerOver = useCallback(
      (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onTileHover();
      },
      [onTileHover]
    );

    const onPointerOut = useCallback(
      (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onTileHoverEnd();
      },
      [onTileHoverEnd]
    );

    return (
      <group
        position={surfacePose.position}
        quaternion={surfacePose.quaternion}
      >
        {/* The visible slab: on the surface for land tiles, dropped to the
            basin floor for canyon tiles (the bowl bed). */}
        <mesh position={[0, slabLocalY, 0]} material={material} receiveShadow>
          <boxGeometry args={[tileSize, LEVEL_EDITOR_TILE_HEIGHT, tileSize]} />
        </mesh>

        {/* Invisible hitbox at the surface: three raycasts it regardless of
            visibility, so a click over the (lowered) canyon still registers
            on this tile — mirroring the game's `CanyonTile`. */}
        <mesh
          visible={false}
          onClick={onTileClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        >
          <boxGeometry args={[tileSize, LEVEL_EDITOR_TILE_HEIGHT + 0.2, tileSize]} />
        </mesh>
      </group>
    );
  }
);

EditorSphereTile.displayName = "EditorSphereTile";

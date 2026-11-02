import { FC, memo, useCallback, useEffect, useMemo } from "react";

import type { ThreeEvent } from "@react-three/fiber";
import { MeshStandardMaterial } from "three";

import { getCssColorValue, type ColorToken } from "../../ui/lib/cssUtils";
import type { LevelEditorTool } from "../../../core/types/editor";
import { hashGrid2D } from "../../../core/tileGridHash";
import type { TilePlacementState } from "../../../utils/tilePlacement";
import { tileToWorldCoordinate } from "../../../utils/levelEditor";
import { createPlanetTileMaterial } from "../../../utils/planetTileMaterial";

export const LEVEL_EDITOR_TILE_HEIGHT = 0.02;

const toolTokenMap: Record<LevelEditorTool, ColorToken> = {
  select: "editor-tool-select",
  placeBuilding: "editor-tool-place-building",
  drawPath: "editor-tool-draw-path",
  setSpawn: "editor-tool-set-spawn",
  setBase: "editor-tool-set-base",
  erase: "editor-tool-erase",
  water: "editor-tool-water",
};

const getToolPreviewColor = (tool: LevelEditorTool): string =>
  getCssColorValue(toolTokenMap[tool]);

type LevelEditorTerrainTileProps = {
  gridX: number;
  gridZ: number;
  gridSize: number;
  tileSize: number;
  landBaseColor: string;
  placementState: TilePlacementState;
  isHovered: boolean;
  canHighlightEditorAction: boolean;
  activeTool: LevelEditorTool;
  onTileClick: () => void;
  onTileHover: () => void;
  onTileHoverEnd: () => void;
};

export const LevelEditorTerrainTile: FC<LevelEditorTerrainTileProps> = memo(
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
    onTileClick,
    onTileHover,
    onTileHoverEnd,
  }) => {
    const material = useMemo(() => {
      if (!placementState.isOnPath && !placementState.isWater && !isHovered) {
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
    ]);

    useEffect(
      () => () => {
        material.dispose();
      },
      [material]
    );

    const position = useMemo(
      () =>
        [
          tileToWorldCoordinate(gridX, gridSize, tileSize),
          0,
          tileToWorldCoordinate(gridZ, gridSize, tileSize),
        ] as [number, number, number],
      [gridX, gridZ, gridSize, tileSize]
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
      <mesh
        position={position}
        material={material}
        receiveShadow
        onClick={onTileClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        <boxGeometry args={[tileSize, LEVEL_EDITOR_TILE_HEIGHT, tileSize]} />
      </mesh>
    );
  }
);

LevelEditorTerrainTile.displayName = "LevelEditorTerrainTile";

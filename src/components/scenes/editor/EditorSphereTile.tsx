import { FC, memo, useCallback, useEffect, useMemo } from "react";

import type { ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, MeshStandardMaterial } from "three";

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

// The non-land slabs (path, water, canyon, hover tints) are identical on
// every tile that shows them: one material per (colour, hovered) pair
// instead of one per tile (never disposed — the scene's lifetime).
const editorTileMaterialCache = new Map<string, MeshStandardMaterial>();
const getEditorTileMaterial = (color: string, isHovered: boolean) => {
  const key = `${isHovered ? 1 : 0}|${color}`;
  const entry = editorTileMaterialCache.get(key);
  if (entry) return entry;
  const material = new MeshStandardMaterial({
    transparent: true,
    opacity: isHovered ? 0.75 : 0.45,
    color,
    emissive: isHovered ? color : getCssColorValue("scene-black"),
    emissiveIntensity: isHovered ? 0.25 : 0,
  });
  editorTileMaterialCache.set(key, material);
  return material;
};

// Fixed-arg slab and hitbox geometries, shared across all tiles of a grid
// size (never disposed — the scene's lifetime).
const slabGeometryCache = new Map<number, BoxGeometry>();
const getSlabGeometry = (tileSize: number): BoxGeometry => {
  const entry = slabGeometryCache.get(tileSize);
  if (entry) return entry;
  const geometry = new BoxGeometry(tileSize, LEVEL_EDITOR_TILE_HEIGHT, tileSize);
  slabGeometryCache.set(tileSize, geometry);
  return geometry;
};

const hitboxGeometryCache = new Map<number, BoxGeometry>();
const getHitboxGeometry = (tileSize: number): BoxGeometry => {
  const entry = hitboxGeometryCache.get(tileSize);
  if (entry) return entry;
  const geometry = new BoxGeometry(
    tileSize,
    LEVEL_EDITOR_TILE_HEIGHT + 0.2,
    tileSize
  );
  hitboxGeometryCache.set(tileSize, geometry);
  return geometry;
};

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

    // Only the plain land slab is tile-owned (per-tile seeded regolith); the
    // non-land slabs share one material per (colour, hovered) pair and must
    // not be disposed here.
    const { material, shared } = useMemo(() => {
      if (
        !placementState.isOnPath &&
        !placementState.isWater &&
        !placementState.isCanyon &&
        !isHovered
      ) {
        return {
          material: createPlanetTileMaterial({
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
          }),
          shared: false,
        };
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

      return {
        material: getEditorTileMaterial(color, isHovered),
        shared: true,
      };
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
        if (!shared) material.dispose();
      },
      [material, shared]
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
        <mesh
          position={[0, slabLocalY, 0]}
          geometry={getSlabGeometry(tileSize)}
          material={material}
          receiveShadow
        />

        {/* Invisible hitbox at the surface: three raycasts it regardless of
            visibility, so a click over the (lowered) canyon still registers
            on this tile — mirroring the game's `CanyonTile`. */}
        <mesh
          visible={false}
          geometry={getHitboxGeometry(tileSize)}
          onClick={onTileClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        />
      </group>
    );
  }
);

EditorSphereTile.displayName = "EditorSphereTile";

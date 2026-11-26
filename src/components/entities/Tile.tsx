import {
  FC,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { Mesh, MeshStandardMaterial } from "three";

import {
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  createEditorTileHoveredSelector,
  useLevelEditorStore,
} from "../../core/stores/useLevelEditorStore";
import { hashGrid2D } from "../../core/tileGridHash";
import { createPlanetTileMaterial } from "../../utils/planetTileMaterial";
import { freezeSubtree } from "../../utils/freezeSubtree";
import { getSlabGeometry, getSphereTilePose } from "../../utils/sphereTile";
import { getCssColorValue } from "../ui/lib/cssUtils";

type PlacementHoverKey = "idle" | "canPlace" | "cannotPlace";

// The hover tints and the path-land material are identical on every tile that
// shows them, so each is a single lazy shared instance (never disposed — the
// scene's lifetime).
const sharedTileMaterialCache = new Map<string, MeshStandardMaterial>();
const getSharedTileMaterial = (
  key: string,
  params: ConstructorParameters<typeof MeshStandardMaterial>[0]
): MeshStandardMaterial => {
  const entry = sharedTileMaterialCache.get(key);
  if (entry) return entry;
  const material = new MeshStandardMaterial(params);
  sharedTileMaterialCache.set(key, material);
  return material;
};

const getLandHoverMaterial = (key: "canPlace" | "cannotPlace") => {
  const c = getCssColorValue(key === "canPlace" ? "primary" : "destructive");
  return getSharedTileMaterial(`land-${key}`, {
    color: c,
    emissive: c,
    emissiveIntensity: 0.45,
    metalness: 0.05,
    roughness: 0.75,
  });
};

const getSharedPathLandMaterial = () =>
  getSharedTileMaterial("path-land", {
    color: getCssColorValue("scene-gray-700"),
    emissive: getCssColorValue("scene-black"),
    emissiveIntensity: 0,
    metalness: 0.05,
    roughness: 0.88,
  });

type TileProps = {
  gridX: number;
  gridZ: number;
  isOnPath: boolean;
  canPlace: boolean;
  /** The board size; defaults to the published level. The editor passes its
      draft grid so the tile sits on the matching sphere. */
  gridSize?: number;
  /** The board's pointer input now arrives through the shared pick surface
      (see `BoardPickSurface`), not per-tile handlers. In the editor the tile
      resolves hover itself from the editor store's per-tile hover flag, so
      only the hovered tile re-renders on pointer moves; in the game the
      overlay owns all placement feedback, so this is omitted there too. */
  editorMode?: boolean;
  /** Optional manual hover override. */
  isHovered?: boolean;
};

/**
 * The land (or path) half of a tile: the slab a non-water cell shows. Water
 * cells render through `WaterSurface` instead — the scenes dispatch the two
 * by occupancy, so `Tile` never sees water.
 */
export const Tile: FC<TileProps> = memo(
  ({
    gridX,
    gridZ,
    isOnPath,
    canPlace,
    gridSize: gridSizeProp,
    isHovered: isHoveredProp,
    editorMode = false,
  }) => {
    const tileSize = useGameStore(tileSizeSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);

    // In the editor the cell tints itself from the editor store's per-tile
    // hover flag (the board's pick surface writes it); in the game the
    // overlay owns placement feedback, so the tile stays unmarked.
    const isEditorTileHovered = useLevelEditorStore(
      createEditorTileHoveredSelector(gridX, gridZ)
    );
    const storeGridSize = useLevelStore(gridSizeSelector);

    const gridSize = gridSizeProp ?? storeGridSize;

    // In the editor the cell tints only when the active tool can act on it
    // (`canPlace` is the scene's `canHighlightEditorAction`); the game never
    // tints land from here (the overlay covers it).
    const isHovered =
      isHoveredProp ?? (editorMode && isEditorTileHovered && canPlace);

    const placementHoverKey = useMemo<PlacementHoverKey>(() => {
      if (!isHovered) return "idle";
      return canPlace ? "canPlace" : "cannotPlace";
    }, [isHovered, canPlace]);

    const slabGeometry = useMemo(
      () => getSlabGeometry(tileSize, pathYOffset, false),
      [tileSize, pathYOffset]
    );
    const planetPose = useMemo(
      () => getSphereTilePose(gridX, gridZ, gridSize, tileSize, pathYOffset / 2),
      [gridX, gridZ, gridSize, tileSize, pathYOffset]
    );

    const meshRef = useRef<Mesh>(null);
    useLayoutEffect(() => {
      if (meshRef.current) freezeSubtree(meshRef.current);
    }, [planetPose]);

    // The hover tints and the path-land body are shared instances (they
    // outlive the tile, so they must not be disposed here); only the per-tile
    // seeded regolith material is tile-owned.
    const { material, shared } = useMemo(() => {
      if (placementHoverKey === "canPlace") {
        return { material: getLandHoverMaterial("canPlace"), shared: true };
      }
      if (placementHoverKey === "cannotPlace") {
        return { material: getLandHoverMaterial("cannotPlace"), shared: true };
      }

      if (!isOnPath) {
        return {
          material: createPlanetTileMaterial({
            baseColor: getCssColorValue("scene-gray-700"),
            emissive: getCssColorValue("scene-black"),
            emissiveIntensity: 0,
            metalness: 0.05,
            roughness: 0.88,
            tileSeed: hashGrid2D(gridX, gridZ),
            tileHalfHeight: pathYOffset / 2,
            regolithHighlight: getCssColorValue("scene-regolith-highlight"),
            regolithShadow: getCssColorValue("scene-regolith-shadow"),
          }),
          shared: false,
        };
      }

      return { material: getSharedPathLandMaterial(), shared: true };
    }, [isOnPath, placementHoverKey, gridX, gridZ, pathYOffset]);

    useEffect(
      () => () => {
        if (!shared) material.dispose();
      },
      [material, shared]
    );

    return (
      <mesh
        ref={meshRef}
        position={planetPose.position}
        quaternion={planetPose.quaternion}
        geometry={slabGeometry}
        material={material}
        castShadow
        receiveShadow
      />
    );
  }
);

Tile.displayName = "Tile";

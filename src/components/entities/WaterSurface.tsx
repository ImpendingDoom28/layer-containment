import {
  FC,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { Group, Mesh, MeshStandardMaterial, Vector3 } from "three";

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
import { WATER_VARIANTS } from "../../utils/tileOccupancy";
import { createPlanetTileMaterial } from "../../utils/planetTileMaterial";
import {
  createWaterMaterial,
  WATER_AMPLITUDE,
} from "../../utils/waterMaterial";
import { useWaterClock } from "../../core/contexts/WaterClockContext";
import { freezeSubtree } from "../../utils/freezeSubtree";
import { getSlabGeometry, getSphereTilePose } from "../../utils/sphereTile";
import { getWaterVariantSlabs } from "../../utils/tileVariantSlab";
import { getCssColorValue } from "../ui/lib/cssUtils";

type PlacementHoverKey = "idle" | "canPlace" | "cannotPlace";

// The tile's top face (the shore) sits at pathYOffset above the ground
// sphere, so the water has a 0.05 basin between the shore and the sphere.
// Recess the water top face to the middle of that basin — 0.025 above the
// sphere, 0.025 below the shore — so the ±~0.020 swell (WATER_AMPLITUDE ×
// field peak ~0.78) neither pokes through the shoreline nor digs through
// the ground sphere: the pool swells inside the basin instead of crossing
// the terrain it sits in.
const WATER_BED_OFFSET = 0.025;

// The hover tints and the dry-land material are identical on every water tile
// that shows them, so each is a single lazy shared instance (never disposed —
// the scene's lifetime). The water hover tints differ from the land ones in
// metalness/roughness to keep the wet look under the tint.
const sharedWaterTileMaterialCache = new Map<string, MeshStandardMaterial>();
const getSharedWaterTileMaterial = (
  key: string,
  params: ConstructorParameters<typeof MeshStandardMaterial>[0]
): MeshStandardMaterial => {
  const entry = sharedWaterTileMaterialCache.get(key);
  if (entry) return entry;
  const material = new MeshStandardMaterial(params);
  sharedWaterTileMaterialCache.set(key, material);
  return material;
};

const getWaterHoverMaterial = (key: "canPlace" | "cannotPlace") => {
  const c = getCssColorValue(key === "canPlace" ? "primary" : "destructive");
  return getSharedWaterTileMaterial(`water-${key}`, {
    color: c,
    emissive: c,
    emissiveIntensity: 0.35,
    metalness: 0.35,
    roughness: 0.22,
  });
};

const getLandHoverMaterial = (key: "canPlace" | "cannotPlace") => {
  const c = getCssColorValue(key === "canPlace" ? "primary" : "destructive");
  return getSharedWaterTileMaterial(`land-${key}`, {
    color: c,
    emissive: c,
    emissiveIntensity: 0.45,
    metalness: 0.05,
    roughness: 0.75,
  });
};

// The dry half of a partial water tile is the same seeded regolith as a land
// tile: one material per (tile, slab height), disposed with the tile.
const landRegolithMaterialCache = new Map<string, MeshStandardMaterial>();
const getLandRegolithMaterial = (
  gridX: number,
  gridZ: number,
  pathYOffset: number
): MeshStandardMaterial => {
  const key = `${gridX}-${gridZ}|${pathYOffset}`;
  const entry = landRegolithMaterialCache.get(key);
  if (entry) return entry;
  const material = createPlanetTileMaterial({
    baseColor: getCssColorValue("scene-gray-700"),
    emissive: getCssColorValue("scene-black"),
    emissiveIntensity: 0,
    metalness: 0.05,
    roughness: 0.88,
    tileSeed: hashGrid2D(gridX, gridZ),
    tileHalfHeight: pathYOffset / 2,
    regolithHighlight: getCssColorValue("scene-regolith-highlight"),
    regolithShadow: getCssColorValue("scene-regolith-shadow"),
  });
  landRegolithMaterialCache.set(key, material);
  return material;
};

type WaterSurfaceProps = {
  gridX: number;
  gridZ: number;
  /** The water tile's footprint code (`WATER_VARIANTS` index); 0 = full. */
  waterVariantCode?: number;
  canPlace: boolean;
  /** The board size; defaults to the published level. The editor passes its
      draft grid so the tile sits on the matching sphere. */
  gridSize?: number;
  /** The board's pointer input now arrives through the shared pick surface
      (see `BoardPickSurface`), not per-tile handlers. In the editor the
      tile resolves hover itself from the editor store's per-tile hover flag,
      so only the hovered tile re-renders on pointer moves; in the game the
      placement overlay owns all feedback, so this is omitted there. */
  editorMode?: boolean;
  /** Optional manual hover override. */
  isHovered?: boolean;
};

export const WaterSurface: FC<WaterSurfaceProps> = memo(
  ({
    gridX,
    gridZ,
    waterVariantCode = 0,
    canPlace,
    gridSize: gridSizeProp,
    isHovered: isHoveredProp,
    editorMode = false,
  }) => {
    const tileSize = useGameStore(tileSizeSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);

    // In the editor the water cell tints itself from the editor store's
    // per-tile hover flag (the board's pick surface writes it); in the game
    // the placement overlay owns all placement feedback, so the tile stays
    // unmarked.
    const isEditorTileHovered = useLevelEditorStore(
      createEditorTileHoveredSelector(gridX, gridZ)
    );
    const storeGridSize = useLevelStore(gridSizeSelector);

    const waterClock = useWaterClock();
    const gridSize = gridSizeProp ?? storeGridSize;

    // In the editor the water cell tints only when the active tool can act on
    // it (`canPlace` is the scene's `canHighlightEditorAction`); the game
    // never tints water from here (the overlay covers it).
    const isHovered =
      isHoveredProp ?? (editorMode && isEditorTileHovered && canPlace);

    const placementHoverKey = useMemo<PlacementHoverKey>(() => {
      if (!isHovered) return "idle";
      return canPlace ? "canPlace" : "cannotPlace";
    }, [isHovered, canPlace]);

    // The radial recess moves the mesh, not the slab's local coordinates, so
    // the top face is still at local y = pathYOffset/2 — that is what the
    // material's top-face mask keys off.
    const waterTopY = pathYOffset / 2;
    const isAnimatedWater = placementHoverKey === "idle";
    const slabGeometry = useMemo(
      () => getSlabGeometry(tileSize, pathYOffset, isAnimatedWater),
      [tileSize, pathYOffset, isAnimatedWater]
    );
    const planetPose = useMemo(
      () => getSphereTilePose(gridX, gridZ, gridSize, tileSize, waterTopY),
      [gridX, gridZ, gridSize, tileSize, waterTopY]
    );

    // The slab keeps the full pathYOffset height; the recess is a radial push
    // of the whole mesh down the tile's surface normal (its local Y), so the
    // top face sits exactly at waterTopY and the material's mask displaces it.
    const waterMeshPosition = useMemo(
      () =>
        isAnimatedWater
          ? new Vector3(0, -WATER_BED_OFFSET, 0)
              .applyQuaternion(planetPose.quaternion)
              .add(planetPose.position)
          : planetPose.position,
      [isAnimatedWater, planetPose]
    );

    // A partial water tile (a non-full `variant`) is drawn as two slabs that
    // partition the tile: a recessed animated water slab over the wet half,
    // plus a shore-level regolith land slab over the dry half, so the water
    // meets the ground at a crisp shore. `full` (the default) keeps the single
    // full-tile box above.
    const variantSlabs = useMemo(
      () =>
        getWaterVariantSlabs(
          WATER_VARIANTS[waterVariantCode] ?? "full",
          tileSize,
          waterTopY
        ),
      [waterVariantCode, tileSize, waterTopY]
    );
    const isPartialWater = variantSlabs.water != null;

    const landSlab = useMemo(() => {
      if (!isPartialWater) return null;
      if (placementHoverKey === "canPlace") {
        return { material: getLandHoverMaterial("canPlace"), shared: true };
      }
      if (placementHoverKey === "cannotPlace") {
        return { material: getLandHoverMaterial("cannotPlace"), shared: true };
      }
      return {
        material: getLandRegolithMaterial(gridX, gridZ, pathYOffset),
        shared: false,
      };
    }, [isPartialWater, placementHoverKey, gridX, gridZ, pathYOffset]);

    const groupRef = useRef<Group>(null);
    const meshRef = useRef<Mesh>(null);
    useLayoutEffect(() => {
      const root = isPartialWater ? groupRef.current : meshRef.current;
      if (root) freezeSubtree(root);
    }, [isPartialWater, waterMeshPosition]);

    // The hover tints and the dry-half regolith are shared instances (they
    // outlive the tile, so they must not be disposed here); only the per-tile
    // animated water material is tile-owned.
    const { material, shared } = useMemo(() => {
      if (placementHoverKey === "canPlace") {
        return { material: getWaterHoverMaterial("canPlace"), shared: true };
      }
      if (placementHoverKey === "cannotPlace") {
        return { material: getWaterHoverMaterial("cannotPlace"), shared: true };
      }
      // Non-hover water: the visible surface is this tile, so it carries the
      // animated ripple (per-tile instance — disposed by the effect below, so
      // the cached shared body material must not be used here). The top face
      // sits at local y = pathYOffset/2; the swell amplitude is a small fixed
      // world offset.
      return {
        material: createWaterMaterial({
          color: getCssColorValue("scene-water"),
          time: waterClock.time,
          glow: getCssColorValue("scene-water-emissive"),
          amplitude: WATER_AMPLITUDE,
          topY: waterTopY,
        }),
        shared: false,
      };
    }, [placementHoverKey, waterTopY, waterClock]);

    useEffect(
      () => () => {
        if (!shared) material.dispose();
      },
      [material, shared]
    );

    // The dry half's per-tile regolith is tile-owned; the hover tints are
    // shared and must not be disposed.
    useEffect(
      () => () => {
        if (landSlab && !landSlab.shared) landSlab.material.dispose();
      },
      [landSlab]
    );

    // A partial water tile: the recessed wet half plus the shore-level dry
    // half, grouped so one pointer handler covers the whole tile.
    if (
      isPartialWater &&
      variantSlabs.water != null &&
      variantSlabs.land != null &&
      landSlab
    ) {
      return (
        <group
          ref={groupRef}
          position={planetPose.position}
          quaternion={planetPose.quaternion}
        >
          <mesh
            position={[0, -WATER_BED_OFFSET, 0]}
            geometry={variantSlabs.water}
            material={material}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={variantSlabs.land}
            material={landSlab.material}
            castShadow
            receiveShadow
          />
        </group>
      );
    }

    return (
      <mesh
        ref={meshRef}
        position={waterMeshPosition}
        quaternion={planetPose.quaternion}
        geometry={slabGeometry}
        material={material}
        castShadow
        receiveShadow
      />
    );
  }
);

WaterSurface.displayName = "WaterSurface";

import {
  FC,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import type { ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from "three";

import {
  flatFieldToSphereTilePose,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";

import { getCssColorValue } from "../ui/lib/cssUtils";
import {
  pathYOffsetSelector,
  selectedTowerTypeToPlaceSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  hoveredTileSelector,
  setHoveredTileSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { hashGrid2D } from "../../core/tileGridHash";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { createPlanetTileMaterial } from "../../utils/planetTileMaterial";
import {
  createWaterMaterial,
  WATER_AMPLITUDE,
} from "../../utils/waterMaterial";
import { useWaterClock } from "../../core/contexts/WaterClockContext";
import { freezeSubtree } from "../../utils/freezeSubtree";

type PlacementHoverKey = "idle" | "canPlace" | "cannotPlace";

// One geometry per slab shape, shared across all tiles of a level. The water
// slab is subdivided on its top face so the vertex displacement has vertices
// to swell; the non-water slab stays a single-segment box.
const slabGeometryCache = new Map<string, BoxGeometry>();
const getSlabGeometry = (
  tileSize: number,
  pathYOffset: number,
  subdivided: boolean
): BoxGeometry => {
  const key = `${subdivided ? 1 : 0}|${tileSize}x${pathYOffset}`;
  const entry = slabGeometryCache.get(key);
  if (entry) return entry;
  const geometry = new BoxGeometry(
    tileSize,
    pathYOffset,
    tileSize,
    subdivided ? 8 : undefined,
    1,
    subdivided ? 8 : undefined
  );
  slabGeometryCache.set(key, geometry);
  return geometry;
};

// The hover tints and the path-land material are identical on every tile that
// shows them, so each is a single lazy shared instance (never disposed — the
// scene's lifetime). The water hover tints differ from the land ones in
// metalness/roughness to keep the wet look under the tint.
const sharedTileMaterialCache = new Map<string, MeshStandardMaterial>();
const getSharedTileMaterial = (key: string, params: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial => {
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

const getWaterHoverMaterial = (key: "canPlace" | "cannotPlace") => {
  const c = getCssColorValue(key === "canPlace" ? "primary" : "destructive");
  return getSharedTileMaterial(`water-${key}`, {
    color: c,
    emissive: c,
    emissiveIntensity: 0.35,
    metalness: 0.35,
    roughness: 0.22,
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
  isWater: boolean;
  isOnPath: boolean;
  canPlace: boolean;
  onClick: () => void;
  /** The board size; defaults to the published level. The editor passes its
      draft grid so the tile sits on the matching sphere. */
  gridSize?: number;
  /** The editor drives hover from its own store; pass this (with the hover
      callbacks) to override the game-store hover. Omitted in the game. */
  isHovered?: boolean;
  onHover?: () => void;
  onHoverEnd?: () => void;
};

export const Tile: FC<TileProps> = memo(
  ({
    gridX,
    gridZ,
    isWater,
    isOnPath,
    canPlace,
    onClick,
    gridSize: gridSizeProp,
    isHovered: isHoveredProp,
    onHover,
    onHoverEnd,
  }) => {
    const tileSize = useGameStore(tileSizeSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);
    const selectedTowerToPlace = useGameStore(selectedTowerTypeToPlaceSelector);

    const storeGridSize = useLevelStore(gridSizeSelector);
    const hoveredTile = useLevelStore(hoveredTileSelector);
    const setHoveredTile = useLevelStore(setHoveredTileSelector);

    const waterClock = useWaterClock();
    const gridSize = gridSizeProp ?? storeGridSize;

    const isHovered =
      isHoveredProp ??
      (hoveredTile?.gridX === gridX &&
        hoveredTile.gridZ === gridZ &&
        selectedTowerToPlace !== null);

    const placementHoverKey = useMemo<PlacementHoverKey>(() => {
      if (!isHovered) return "idle";
      return canPlace ? "canPlace" : "cannotPlace";
    }, [isHovered, canPlace]);

    // The tile's top face (the shore) sits at pathYOffset above the ground
    // sphere, so the water has a 0.05 basin between the shore and the sphere.
    // Recess the water top face to the middle of that basin — 0.025 above the
    // sphere, 0.025 below the shore — so the ±~0.020 swell (WATER_AMPLITUDE ×
    // field peak ~0.78) neither pokes through the shoreline nor digs through
    // the ground sphere: the pool swells inside the basin instead of crossing
    // the terrain it sits in.
    const WATER_BED_OFFSET = 0.025;
    // The radial recess moves the mesh, not the slab's local coordinates, so
    // the top face is still at local y = pathYOffset/2 — that is what the
    // material's top-face mask keys off.
    const waterTopY = pathYOffset / 2;
    const isAnimatedWater = isWater && placementHoverKey === "idle";
    const slabGeometry = useMemo(
      () => getSlabGeometry(tileSize, pathYOffset, isAnimatedWater),
      [tileSize, pathYOffset, isAnimatedWater]
    );
    const planetPose = useMemo(
      () =>
        flatFieldToSphereTilePose(
          tileToWorldCoordinate(gridX, gridSize, tileSize),
          tileToWorldCoordinate(gridZ, gridSize, tileSize),
          getPlanetRadius(gridSize, tileSize),
          pathYOffset / 2
        ),
      [gridX, gridZ, gridSize, tileSize, pathYOffset]
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
      [isAnimatedWater, planetPose, WATER_BED_OFFSET]
    );

    const meshRef = useRef<Mesh>(null);
    useLayoutEffect(() => {
      if (meshRef.current) freezeSubtree(meshRef.current);
    }, [waterMeshPosition]);

    // The hover tints and the path-land body are shared instances (they
    // outlive the tile, so they must not be disposed here); only the per-tile
    // animated water and seeded regolith materials are tile-owned.
    const { material, shared } = useMemo(() => {
      if (isWater) {
        const base = getCssColorValue("scene-water");
        const emissiveHue = getCssColorValue("scene-water-emissive");
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
            color: base,
            time: waterClock.time,
            glow: emissiveHue,
            amplitude: WATER_AMPLITUDE,
            topY: waterTopY,
          }),
          shared: false,
        };
      }

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
    }, [
      isWater,
      isOnPath,
      placementHoverKey,
      gridX,
      gridZ,
      pathYOffset,
      waterTopY,
      waterClock,
    ]);

    useEffect(
      () => () => {
        if (!shared) material.dispose();
      },
      [material, shared]
    );

    const onPointerOver = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (onHover) {
          onHover();
          return;
        }
        setHoveredTile({ gridX, gridZ });
      },
      [onHover, setHoveredTile, gridX, gridZ]
    );

    const onPointerOut = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (onHoverEnd) {
          onHoverEnd();
          return;
        }
        setHoveredTile(null);
      },
      [onHoverEnd, setHoveredTile]
    );

    const onInnerClick = useCallback(
      (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
      },
      [onClick]
    );

    return (
      <mesh
        ref={meshRef}
        position={waterMeshPosition}
        quaternion={planetPose.quaternion}
        geometry={slabGeometry}
        material={material}
        castShadow
        receiveShadow
        onClick={onInnerClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      />
    );
  }
);

Tile.displayName = "Tile";

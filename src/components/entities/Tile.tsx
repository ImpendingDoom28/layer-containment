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
import { Mesh, MeshStandardMaterial } from "three";

import {
  flatFieldToSphereTilePose,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";

import { getCssColorValue } from "../ui/lib/cssUtils";
import {
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { hashGrid2D } from "../../core/tileGridHash";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { createPlanetTileMaterial } from "../../utils/planetTileMaterial";
import { createWaterMaterial } from "../../utils/waterMaterial";
import { useWaterClock } from "../../core/contexts/WaterClockContext";
import { freezeSubtree } from "../../utils/freezeSubtree";

type PlacementHoverKey = "idle" | "canPlace" | "cannotPlace";

type TileProps = {
  gridX: number;
  gridZ: number;
  isWater: boolean;
  isOnPath: boolean;
  isHovered: boolean;
  canPlace: boolean;
  onClick: () => void;
  onHover?: (gridX: number, gridZ: number) => void;
  onHoverEnd?: () => void;
};

export const Tile: FC<TileProps> = memo(
  ({
    gridX,
    gridZ,
    isWater,
    isOnPath,
    isHovered,
    canPlace,
    onClick,
    onHover,
    onHoverEnd,
  }) => {
    const tileSize = useGameStore(tileSizeSelector);
    const gridSize = useLevelStore(gridSizeSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);
    const waterClock = useWaterClock();

    const placementHoverKey = useMemo<PlacementHoverKey>(() => {
      if (!isHovered) return "idle";
      return canPlace ? "canPlace" : "cannotPlace";
    }, [isHovered, canPlace]);

    // Water tiles get a subdivided box (8×8 top-face grid) so the vertex
    // displacement has enough vertices to swell; the 4 corners of a plain box
    // could only tilt. Non-water (or hover) tiles stay a single-segment box.
    const waterTopY = pathYOffset / 2;
    const WATER_AMPLITUDE = 0.05;
    const WATER_TOP_SEGMENTS = 8;
    // Water sits below the land plane so the tiles read as a recessed pool:
    // the land edge casts a rim on the surface, and the swell moves inside
    // the basin instead of poking through the shoreline.
    const WATER_BED_OFFSET = 0.05;
    const isAnimatedWater = isWater && placementHoverKey === "idle";
    const TILE_POSITION:
      | [
          width?: number | undefined,
          height?: number | undefined,
          depth?: number | undefined,
          widthSegments?: number | undefined,
          heightSegments?: number | undefined,
          depthSegments?: number | undefined,
        ]
      | undefined = isAnimatedWater
      ? [
          tileSize,
          pathYOffset - WATER_BED_OFFSET,
          tileSize,
          WATER_TOP_SEGMENTS,
          1,
          WATER_TOP_SEGMENTS,
        ]
      : [tileSize, pathYOffset, tileSize];
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

    const meshRef = useRef<Mesh>(null);
    useLayoutEffect(() => {
      if (meshRef.current) freezeSubtree(meshRef.current);
    }, [planetPose]);

    const material = useMemo(() => {
      if (isWater) {
        const base = getCssColorValue("scene-water");
        const emissiveHue = getCssColorValue("scene-water-emissive");
        if (placementHoverKey === "canPlace") {
          return new MeshStandardMaterial({
            color: getCssColorValue("primary"),
            emissive: getCssColorValue("primary"),
            emissiveIntensity: 0.35,
            metalness: 0.35,
            roughness: 0.22,
          });
        }
        if (placementHoverKey === "cannotPlace") {
          return new MeshStandardMaterial({
            color: getCssColorValue("destructive"),
            emissive: getCssColorValue("destructive"),
            emissiveIntensity: 0.35,
            metalness: 0.35,
            roughness: 0.22,
          });
        }
        // Non-hover water: the visible surface is this tile, so it carries the
        // animated ripple (per-tile instance — disposed by the effect below, so
        // the cached shared body material must not be used here). The top face
        // sits at local y = pathYOffset/2; the swell amplitude is a small fixed
        // world offset.
        return createWaterMaterial({
          color: base,
          time: waterClock.time,
          glow: emissiveHue,
          amplitude: WATER_AMPLITUDE,
          topY: waterTopY,
        });
      }

      if (placementHoverKey === "canPlace") {
        const c = getCssColorValue("primary");
        return new MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: 0.45,
          metalness: 0.05,
          roughness: 0.75,
        });
      }
      if (placementHoverKey === "cannotPlace") {
        const c = getCssColorValue("destructive");
        return new MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: 0.45,
          metalness: 0.05,
          roughness: 0.75,
        });
      }

      const land = getCssColorValue("scene-gray-700");
      const baseLand = {
        emissive: getCssColorValue("scene-black"),
        emissiveIntensity: 0,
        metalness: 0.05,
        roughness: 0.88,
      };

      if (!isOnPath) {
        return createPlanetTileMaterial({
          baseColor: land,
          ...baseLand,
          tileSeed: hashGrid2D(gridX, gridZ),
          tileHalfHeight: pathYOffset / 2,
          regolithHighlight: getCssColorValue("scene-regolith-highlight"),
          regolithShadow: getCssColorValue("scene-regolith-shadow"),
        });
      }

      return new MeshStandardMaterial({
        color: land,
        ...baseLand,
      });
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
        material.dispose();
      },
      [material]
    );

    const onInnerPointerOver = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover?.(gridX, gridZ);
      },
      [onHover, gridX, gridZ]
    );

    const onInnerPointerOut = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHoverEnd?.();
      },
      [onHoverEnd]
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
        position={planetPose.position}
        quaternion={planetPose.quaternion}
        material={material}
        castShadow
        receiveShadow
        onClick={onInnerClick}
        onPointerOver={onInnerPointerOver}
        onPointerOut={onInnerPointerOut}
      >
        <boxGeometry args={TILE_POSITION} />
      </mesh>
    );
  }
);

Tile.displayName = "Tile";
